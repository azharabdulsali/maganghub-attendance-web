"use client";

// src/app/(app)/report-templates/report-templates-form.tsx: form 3 template.
//
// Alasan bentuknya begini:
//   - Penghitung karakter tampil LANGSUNG saat mengetik. Aturan 100 karakter
//     milik portal; kalau pengguna baru tahu setelah menekan Simpan, itu
//     pengalaman yang buruk.
//   - Tombol Simpan mati selama ada kolom yang belum memenuhi syarat. Lebih
//     baik mencegah daripada menampilkan error setelah mencoba.
//   - Hitungan memakai `countReportLength` yang sama dengan server, jadi angka
//     di layar tidak mungkin berbeda dari yang divalidasi server.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, TriangleAlert, WandSparkles } from "lucide-react";
import { FORM_ANCHOR_ID } from "./open-dated-button";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  MIN_REPORT_LENGTH,
  MAX_REPORT_LENGTH,
  countReportLength,
  checkReportField,
} from "@/lib/report-rules";
import {
  isHoliday,
  isAfter,
  LAST_ACTIVE_DATE,
} from "@/lib/report-policy";

const FIELDS = [
  {
    name: "activity" as const,
    label: "Uraian Aktivitas",
    hint: "Apa yang Anda kerjakan hari itu.",
  },
  {
    name: "learning" as const,
    label: "Pembelajaran yang Diperoleh",
    hint: "Ilmu atau pengalaman baru yang didapat.",
  },
  {
    name: "obstacles" as const,
    label: "Kendala yang Dialami",
    hint: 'Hambatan yang ditemui, atau tulis "tidak ada kendala" bila lancar.',
  },
];

type FieldName = (typeof FIELDS)[number]["name"];

/** Isi template untuk satu tanggal (atau default bila `date` null). */
export interface DatedEntry {
  date: string;
  activity: string;
  learning: string;
  obstacles: string;
}

interface Props {
  hasExisting: boolean;
  initialActivity: string;
  initialLearning: string;
  initialObstacles: string;
  updatedAt: string | null;
  /** Tanggal hari ini WIB (dihitung server) untuk penanda status tanggal. */
  today: string;
  /** Template khusus tanggal yang sudah tersimpan. */
  initialDated?: DatedEntry[];
  /**
   * Tanggal yang dibuka lewat tombol "Buka" di daftar template per tanggal
   * (`?date=YYYY-MM-DD`). Bila diisi, form langsung menampilkan tanggal itu.
   */
  initialDate?: string | null;
  /**
   * Daftar libur dari tabel admin (`YYYY-MM-DD`) sebagai ARRAY, bukan Set:
   * prop ini melewati batas server→klien yang menuntut nilai serializable.
   * Dipakai agar tanggal libur dinonaktifkan di DatePicker & ditandai di sini.
   */
  holidays?: string[];
}

const KOSONG: Record<FieldName, string> = {
  activity: "",
  learning: "",
  obstacles: "",
};

export default function ReportTemplatesForm({
  hasExisting,
  initialActivity,
  initialLearning,
  initialObstacles,
  updatedAt,
  today,
  initialDated = [],
  initialDate = null,
  holidays = [],
}: Props) {
  // Set libur dibangun sekali (union statis + dari DB) supaya DatePicker &
  // penanda status memakai sumber yang sama persis.
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  // Template default disimpan terpisah supaya bisa kembali saat picker dikosongkan.
  const [defaultValues, setDefaultValues] = useState<Record<FieldName, string>>({
    activity: initialActivity,
    learning: initialLearning,
    obstacles: initialObstacles,
  });
  // Daftar override, kunci = tanggal (YYYY-MM-DD).
  const [dated, setDated] = useState<Record<string, Record<FieldName, string>>>(
    () => {
      const out: Record<string, Record<FieldName, string>> = {};
      for (const d of initialDated) {
        out[d.date] = {
          activity: d.activity,
          learning: d.learning,
          obstacles: d.obstacles,
        };
      }
      return out;
    },
  );
  // null = mengedit template default; string = mengedit override tanggal itu.
  // Bila dibuka dari tombol "Buka" (`?date=`), langsung mulai di tanggal itu.
  const [tanggal, setTanggal] = useState<string | null>(() => {
    if (!initialDate) return null;
    // Terima tanggal yang sudah tersimpan, atau tanggal polos yang sah supaya
    // "Buka" pada tanggal tanpa template tetap bekerja (membuat baru).
    if (dated[initialDate] || /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      return initialDate;
    }
    return null;
  });
  // `values` selalu mencerminkan yang SEDANG diedit. Saat `tanggal` kosong,
  // ini template default (berlaku semua tanggal); saat berisi, ini override
  // untuk tanggal itu. Isi lama disimpan agar tidak hilang saat berpindah.
  // Nilai awal mengikuti tanggal terpilih: template tanggal itu bila ada,
  // selain itu template default (supaya "Buka" tidak menampilkan form kosong).
  const [values, setValues] = useState<Record<FieldName, string>>(() =>
    tanggal && dated[tanggal]
      ? dated[tanggal]
      : {
          activity: initialActivity,
          learning: initialLearning,
          obstacles: initialObstacles,
        },
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(updatedAt);
  const [exists, setExists] = useState(hasExisting);
  const [confirmHapusOpen, setConfirmHapusOpen] = useState(false);
  const [confirmSusunOpen, setConfirmSusunOpen] = useState(false);
  const toast = useToast();
  const router = useRouter();


  // Bahan untuk penyusun draf. Dipisah dari `values` karena ini BUKAN isi
  // template final, hanya kata kunci sementara yang tidak ikut tersimpan.
  const [keywords, setKeywords] = useState("");
  const [unit, setUnit] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftSource, setDraftSource] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Hitung status tiap kolom sekali per perubahan isi.
  const status = useMemo(() => {
    const hasil = {} as Record<
      FieldName,
      { panjang: number; error: string | null }
    >;
    for (const f of FIELDS) {
      hasil[f.name] = {
        panjang: countReportLength(values[f.name]),
        error: checkReportField(values[f.name]),
      };
    }
    return hasil;
  }, [values]);

  const semuaValid = FIELDS.every((f) => status[f.name].error === null);

  function ubah(name: FieldName, teks: string) {
    setValues((prev) => ({ ...prev, [name]: teks }));
    setServerError(null);
  }

  /**
   * Pindah konteks edit. Isi yang sedang diketik disimpan dulu ke tempatnya
   * (default atau tanggal lama) supaya tidak hilang saat berpindah.
   */
  function pindah(tujuan: string | null) {
    const t = tujuan && tujuan.trim() !== "" ? tujuan : null;
    // Simpan draf konteks saat ini.
    if (tanggal === null) {
      setDefaultValues(values);
    } else {
      setDated((prev) => ({ ...prev, [tanggal]: values }));
    }
    // Muat isi konteks tujuan.
    setValues(t === null ? defaultValues : dated[t] ?? KOSONG);
    setTanggal(t);
    setServerError(null);
  }

  /** Bila tanggal yang dipilih belum punya override, tombol Simpan = buat baru. */
  const konteksAda = tanggal === null ? exists : dated[tanggal] !== undefined;

  /** Apakah tanggal ini jatuh pada hari libur / di luar program (perlu ditandai). */
  const statusTanggal = useMemo(() => {
    if (tanggal === null) return null;
    if (isAfter(tanggal, LAST_ACTIVE_DATE)) return "Di luar masa program";
    if (isHoliday(tanggal, holidaySet)) return "Libur, otomasi tidak mengirim";
    if (isAfter(today, tanggal)) return "Sudah lewat";
    return "Siap dipakai";
  }, [tanggal, today, holidaySet]);

  /**
   * Minta server menyusun draf dari kata kunci, lalu isikan hasilnya ke ketiga
   * kolom. Hasil TIDAK langsung disimpan, pengguna masih bisa mengedit dulu.
   *
   * Kalau ada kolom yang sudah diisi, kita minta konfirmasi dulu supaya
   * pekerjaan pengguna tidak tertimpa begitu saja.
   */
  async function susun() {
    if (drafting) return;
    setDrafting(true);
    setDraftError(null);

    try {
      const res = await fetch("/api/report-templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords,
          unit: unit.trim() === "" ? undefined : unit,
        }),
      });

      const data = (await res.json()) as {
        activity?: string;
        learning?: string;
        obstacles?: string;
        source?: string;
        error?: string;
      };

      if (!res.ok) {
        setDraftError(data.error ?? "Gagal menyusun draf.");
        return;
      }

      setValues({
        activity: data.activity ?? "",
        learning: data.learning ?? "",
        obstacles: data.obstacles ?? "",
      });
      setDraftSource(data.source ?? null);
      setServerError(null);
      toast.success(
        "Draf disusun",
        "Periksa dan sesuaikan isinya sebelum menyimpan.",
      );
    } catch {
      // Jaringan gagal: beri tahu apa adanya, jangan diam-diam mengosongkan.
      setDraftError("Tidak bisa menghubungi server. Periksa koneksi Anda.");
    } finally {
      setDrafting(false);
    }
  }

  /** Apakah ketiga kolom saat ini sudah berisi sesuatu? */
  const adaIsi = FIELDS.some((f) => values[f.name].trim() !== "");

  function mintaSusun() {
    if (adaIsi) {
      setConfirmSusunOpen(true);
      return;
    }
    void susun();
  }

  async function simpan() {
    if (!semuaValid || saving) return;
    setSaving(true);
    setServerError(null);

    // Dua endpoint berbeda, satu tombol: default → /api/report-templates,
    // tanggal → /api/report-templates/dated (upsert per tanggal).
    const keTanggal = tanggal !== null;
    try {
      const res = await fetch(
        keTanggal ? "/api/report-templates/dated" : "/api/report-templates",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(keTanggal ? { date: tanggal, ...values } : values),
        },
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setServerError(data.error ?? "Gagal menyimpan. Coba lagi.");
        return;
      }

      if (keTanggal) {
        setDated((prev) => ({ ...prev, [tanggal]: values }));
        toast.success(
          "Template tanggal tersimpan",
          "Dipakai hanya untuk tanggal ini, template default tidak berubah.",
        );
        // Tabel "Template Khusus Tanggal Tertentu" di bawah adalah server
        // component dengan query Prisma-nya sendiri. Ia hanya mengambil data
        // ulang saat halaman di-render, jadi tanpa refresh baris baru tidak
        // muncul sampai pengguna me-refresh manual.
        router.refresh();
      } else {
        setDefaultValues(values);
        setExists(true);
        setSavedAt(data.updatedAt ?? new Date().toISOString());
        toast.success(
          "Template tersimpan",
          "Absensi otomatis memakai isi terbaru.",
        );
      }
    } catch {
      setServerError("Tidak bisa menghubungi server. Periksa koneksi Anda.");
    } finally {
      setSaving(false);
    }
  }

  async function hapus() {
    if (deleting) return;

    setDeleting(true);
    setServerError(null);

    const keTanggal = tanggal !== null;
    try {
      const res = await fetch(
        keTanggal
          ? `/api/report-templates/dated?date=${encodeURIComponent(tanggal)}`
          : "/api/report-templates",
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const pesan = data.error ?? "Gagal menghapus. Coba lagi.";
        setServerError(pesan);
        toast.error("Gagal menghapus template", pesan);
        return;
      }

      if (keTanggal) {
        // Buang override-nya, lalu kembali ke konteks default.
        setDated((prev) => {
          const next = { ...prev };
          delete next[tanggal];
          return next;
        });
        setValues(defaultValues);
        setTanggal(null);
        toast.success(
          "Template tanggal dihapus",
          "Tanggal itu kembali memakai template default.",
        );
      } else {
        setValues(KOSONG);
        setDefaultValues(KOSONG);
        setExists(false);
        setSavedAt(null);
        toast.success("Template dihapus", "Isi template sudah dikosongkan.");
      }
    } catch {
      const pesan = "Tidak bisa menghubungi server. Periksa koneksi Anda.";
      setServerError(pesan);
      toast.error("Gagal menghapus template", pesan);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      id={FORM_ANCHOR_ID}
      className="flex scroll-mt-24 flex-col gap-6"
    >
      {/* Pemilih tanggal: satu form, konteks berganti. Kosong = template default
          yang berlaku untuk semua tanggal; ada tanggal = penimpa untuk tanggal
          itu saja. Ini menghindari dua form terpisah yang membingungkan. */}
      <div className="rounded-base border-2 border-border bg-secondary-background p-4">
        {/* Label + picker + tombol "Kembali ke default" diletakkan dalam satu
            baris sejajar (`items-end`) supaya tombol menempel pada tinggi
            picker, bukan pada dasar kolom yang ikut memuat teks bantuan.
            Sebelumnya teks bantuan ada di dalam kolom ini, sehingga `items-end`
            mendorong tombol turun ke bawah teks bantuan dan posisinya
            berpindah-pindah mengikuti panjang teks. Teks bantuan kini dipindah
            ke baris penuh di bawah agar posisi tombol tidak lagi bergeser. */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tanggal-target" className="text-xs">
              Tanggal khusus <span className="text-foreground/50">(opsional)</span>
            </Label>
            <DatePicker
              id="tanggal-target"
              value={tanggal}
              disabled={saving || deleting}
              onChange={(v) => pindah(v)}
              placeholder="Semua tanggal (default)"
              className="w-60"
              holidays={holidaySet}
            />
          </div>
          {tanggal !== null ? (
            // `size` disamakan dengan pemicu DatePicker (default, h-10) supaya
            // tingginya sejajar dan posisinya tidak melompat saat muncul.
            <Button
              type="button"
              variant="neutral"
              disabled={saving || deleting}
              onClick={() => pindah(null)}
            >
              Kembali ke default
            </Button>
          ) : null}
        </div>

        <p className="mt-1.5 text-[0.7rem] text-foreground/50">
          Tanggal libur (Sabtu, Minggu, dan hari libur nasional) tidak bisa
          dipilih karena otomasi tidak mengirim laporan pada hari itu.
        </p>

        <p className="mt-2 text-xs text-foreground/70">
          {tanggal === null ? (
            <>
              Sedang mengedit <b>template default</b>. Isi ini dipakai untuk semua
              tanggal yang tidak punya template khusus.
            </>
          ) : (
            <>
              Sedang mengedit <b>template untuk {tanggal}</b>. Isi ini{" "}
              <b>hanya</b> dipakai untuk tanggal itu; tanggal lain tetap memakai
              template default.
            </>
          )}
        </p>

        {/* Status tanggal yang dipilih. Sebelumnya semua keadaan (libur, di
            luar program, sudah lewat, siap) memakai chip abu-abu yang sama
            sehingga peringatan tenggelam. Kini nada dibedakan: "Siap dipakai"
            hijau (`tone="good"`), sisanya merah (`tone="bad"`) karena menandai
            tanggal yang tidak bisa/tidak ideal dikirim. */}
        {statusTanggal ? (
          statusTanggal === "Siap dipakai" ? (
            <Message tone="good" className="mt-2 flex items-center gap-2">
              <CircleCheck className="size-3.5 shrink-0" aria-hidden />
              <span>{statusTanggal}</span>
            </Message>
          ) : (
            <Message tone="bad" className="mt-2 flex items-center gap-2">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              <span>{statusTanggal}</span>
            </Message>
          )
        ) : null}
      </div>

      {/* Ringkasan status penyimpanan. Dua nada (bukan sekadar warna teks):
          "tersimpan" = hijau (`tone="good"`), "belum ada" = merah (`tone="bad"`).
          Memakai komponen `Message` yang sama dengan banner dashboard supaya
          bahasa nada proyek konsisten dan pembaca layar ikut diumumkan
          (`role="alert"` saat nada buruk). */}
      {konteksAda ? (
        <Message tone="good" className="flex items-center gap-2">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          <span>
            {tanggal === null ? "Template tersimpan" : `Template ${tanggal} tersimpan`}
            {tanggal === null && savedAt
              ? `, terakhir diubah ${new Date(savedAt).toLocaleString("id-ID")}`
              : null}
          </span>
        </Message>
      ) : (
        <Message tone="bad" className="flex items-center gap-2">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span>
            {tanggal === null
              ? "Belum ada template default tersimpan. Isi ketiga kolom di bawah lalu tekan Simpan agar absensi bisa berjalan."
              : `Belum ada template untuk ${tanggal}. Isi ketiga kolom di bawah lalu tekan Simpan.`}
          </span>
        </Message>
      )}

      {/* Panel bantuan penyusunan. Sengaja DIPISAH dari ketiga kolom isi supaya
          jelas bedanya: ini bahan (kata kunci), bukan laporan final. */}
      <div className="rounded-base border-2 border-border bg-secondary-background p-4">
        <div className="flex items-center gap-2">
          <WandSparkles className="size-4 shrink-0" aria-hidden />
          <h2 className="font-heading text-base">
            Isi otomatis 3 kolom laporan
          </h2>
        </div>
        <p className="mt-1 text-xs text-foreground/70">
          Tulis singkat apa yang Anda kerjakan hari itu, lalu biarkan sistem
          mengisi ketiga kolom. Hasilnya hanya draf, bisa Anda ubah dulu sebelum
          disimpan.
        </p>
        {/* Pengungkapan lokasi pemrosesan sengaja TIDAK diklaim di sini: server
            memakai LLM (Gemini) bila `GEMINI_API_KEY` diisi, dan itu mengirim
            kata kunci ke penyusun luar. Klaim statis "tanpa layanan AI luar"
            dulu berpotensi bohong. Pengungkapan sebenarnya muncul SETELAH
            menekan "Susun draf", saat sumbernya benar-benar diketahui. */}
        <p className="mt-1 text-xs text-foreground/60">
          Draf disusun oleh server. Bila admin mengaktifkan penyusun AI, kata
          kunci Anda dikirim ke penyusun luar; keterangannya muncul setelah draf
          jadi di bawah.
        </p>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="draft-keywords" className="text-xs">
              Kata kunci aktivitas
            </Label>
            <Input
              id="draft-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              maxLength={300}
              disabled={drafting || saving || deleting}
              placeholder="mis. perbaikan bug login, rapat tim mingguan"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="draft-unit" className="text-xs">
              Unit / divisi <span className="text-foreground/50">(opsional)</span>
            </Label>
            <Input
              id="draft-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={120}
              disabled={drafting || saving || deleting}
              placeholder="mis. IT, Operasional, Finance"
            />
          </div>
          <Button
            onClick={mintaSusun}
            disabled={drafting || saving || deleting}
            variant="neutral"
            size="sm"
            className="shrink-0"
          >
            {drafting ? "Menyusun..." : "Susun draf"}
          </Button>
        </div>

        <p className="mt-2 text-xs text-foreground/60">
          Kosongkan kata kunci bila hari itu tidak ada kendala khusus, kolom
          kendala akan diisi pernyataan jujur bahwa pekerjaan berjalan lancar.
        </p>

        {draftSource ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-foreground/60">
              Draf terakhir disusun oleh:{" "}
              <span className="font-heading">{draftSource}</span>
            </p>
            {/* Pengungkapan privasi tepat waktu: hanya muncul bila penyusunnya
                benar-benar berada di luar (label LLM memuat "Gemini"). Penyusun
                lokal "Lokal 0-Token" tidak pernah memicu ini. */}
            {/gemini/i.test(draftSource) ? (
              <p className="text-xs text-foreground/60">
                Kata kunci tadi dikirim ke penyusun luar (Google) untuk diolah.
                Jangan cantumkan data rahasia; hindari juga bila hal itu tidak
                Anda inginkan.
              </p>
            ) : null}
          </div>
        ) : null}

        {draftError ? (
          <div className="mt-2">
            <Message tone="bad">{draftError}</Message>
          </div>
        ) : null}
      </div>

      {FIELDS.map((f) => {
        const s = status[f.name];
        const kurang = MIN_REPORT_LENGTH - s.panjang;
        // Merah kalau sudah mulai diketik tapi belum cukup; teks normal
        // (tanpa warna khusus) kalau sudah memenuhi syarat, status "lolos"
        // dibedakan lewat ikon, bukan warna, supaya aman untuk buta warna.
        const warna =
          s.panjang === 0
            ? "text-foreground/60"
            : s.error
              ? "text-destructive"
              : "text-foreground";

        return (
          <div key={f.name} className="flex flex-col gap-2">
            <Label htmlFor={f.name} className="font-heading">
              {f.label}
            </Label>
            <p className="text-xs text-foreground/60">{f.hint}</p>

            <Textarea
              id={f.name}
              value={values[f.name]}
              onChange={(e) => ubah(f.name, e.target.value)}
              rows={4}
              maxLength={MAX_REPORT_LENGTH}
              disabled={saving || deleting}
              placeholder={`Tulis ${f.label.toLowerCase()} (minimal ${MIN_REPORT_LENGTH} karakter)...`}
            />

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={`flex items-center gap-1 ${warna}`}>
                {s.panjang === 0 ? (
                  `Minimal ${MIN_REPORT_LENGTH} karakter`
                ) : s.error ? (
                  <>
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                    {s.error}
                  </>
                ) : (
                  <>
                    <CircleCheck className="size-3.5 shrink-0" aria-hidden />
                    Sudah memenuhi syarat
                  </>
                )}
              </span>
              <span className="tabular-nums text-foreground/60">
                {s.panjang}/{MIN_REPORT_LENGTH}
                {kurang > 0 ? ` (kurang ${kurang})` : ""}
              </span>
            </div>
          </div>
        );
      })}

      {serverError ? <Message tone="bad">{serverError}</Message> : null}

      {/* Tombol aksi: keduanya seukuran (size="sm") dan hanya selebar isinya.
          Sebelumnya "Perbarui template" memakai `sm:flex-1` sehingga melebar
          penuh dan terlihat jauh lebih besar dari "Hapus" di sebelahnya,
          padahal keduanya sederajat. Sisi utama tetap dibedakan lewat
          variant (bukan ukuran). */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={simpan}
          disabled={!semuaValid || saving || deleting}
          size="sm"
        >
          {saving
            ? "Menyimpan..."
            : konteksAda
              ? "Perbarui template"
              : "Simpan template"}
        </Button>

        {konteksAda ? (
          <Button
            onClick={() => setConfirmHapusOpen(true)}
            disabled={saving || deleting}
            variant="neutral"
            size="sm"
          >
            {deleting ? "Menghapus..." : "Hapus"}
          </Button>
        ) : null}
      </div>

      {!semuaValid ? (
        <p className="text-xs text-foreground/60">
          Tombol simpan aktif setelah ketiga kolom memenuhi minimal{" "}
          {MIN_REPORT_LENGTH} karakter.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmHapusOpen}
        onOpenChange={setConfirmHapusOpen}
        title={tanggal === null ? "Hapus template default?" : `Hapus template ${tanggal}?`}
        description={
          tanggal === null
            ? "Tindakan ini tidak bisa dibatalkan. Tanpa template default, absensi otomatis tidak bisa dijalankan untuk tanggal yang tidak punya template khusus."
            : "Tanggal ini akan kembali memakai template default. Template default tidak terhapus."
        }
        confirmLabel="Hapus template"
        onConfirm={() => void hapus()}
      />

      {/* Draf akan MENIMPA isi ketiga kolom. Bila sudah ada isi, konfirmasi dulu
          supaya tulisan pengguna tidak hilang tanpa peringatan. */}
      <ConfirmDialog
        open={confirmSusunOpen}
        onOpenChange={setConfirmSusunOpen}
        title="Timpa isi ketiga kolom?"
        description="Kolom yang sudah berisi teks akan diganti oleh draf baru. Pastikan Anda sudah menyalin bagian yang ingin dipertahankan."
        confirmLabel="Ya, susun ulang"
        onConfirm={() => void susun()}
      />
    </div>
  );
}
