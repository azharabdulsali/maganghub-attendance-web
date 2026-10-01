"use client";

// src/app/(app)/report-templates/dated-templates-list.tsx: kelola template
// laporan per-tanggal (penimpa template harian).
//
// Kenapa komponen terpisah dari form harian: keduanya menyentuh endpoint
// berbeda dan yang ini punya daftar dinamis. Menumpuknya di satu berkas membuat
// form harian sulit dibaca.
//
// Yang ditampilkan sengaja jujur:
//   - Tanggal yang jatuh pada Sabtu/Minggu/libur nasional ditandai "Libur" dan
//     diberi keterangan bahwa otomasi TIDAK akan mengirim di hari itu. Tanpa
//     ini, pengguna mengira laporannya akan terkirim padahal tidak.
//   - Template yang tanggalnya sudah lewat ditandai "Sudah lewat".

import { useMemo, useState } from "react";
import { CalendarPlus, CircleCheck, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  isPlainDate,
  LAST_ACTIVE_DATE,
} from "@/lib/report-policy";

const FIELDS = [
  {
    name: "activity" as const,
    label: "Uraian Aktivitas",
    hint: "Apa yang Anda kerjakan pada tanggal itu.",
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

export interface DatedTemplate {
  date: string;
  activity: string;
  learning: string;
  obstacles: string;
  updatedAt: string | null;
}

interface Props {
  /** Tanggal hari ini WIB, dihitung server (bukan jam perangkat). */
  today: string;
  initialTemplates: DatedTemplate[];
}

function kosong(): Record<FieldName, string> {
  return { activity: "", learning: "", obstacles: "" };
}

export default function DatedTemplatesList({ today, initialTemplates }: Props) {
  const [templates, setTemplates] = useState<DatedTemplate[]>(initialTemplates);
  // Form dibuka otomatis hanya bila belum ada apa pun (ajakan mengisi).
  const [formTerbuka, setFormTerbuka] = useState(initialTemplates.length === 0);
  // Tanggal yang sedang disunting; null = mode "tambah baru".
  const [sedangEdit, setSedangEdit] = useState<string | null>(null);
  const [values, setValues] = useState<Record<FieldName, string>>(kosong());
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmHapus, setConfirmHapus] = useState<string | null>(null);
  const toast = useToast();

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

  // Tanggal wajib sudah terisi DAN benar-benar ada di kalender. Saat menyunting,
  // tanggal dikunci (sudah pasti sah dari server).
  const tanggalSah =
    sedangEdit !== null ? true : date.trim() !== "" && isPlainDate(date);
  const semuaValid = FIELDS.every((f) => status[f.name].error === null);
  const bisaSimpan = semuaValid && tanggalSah && !saving;

  function resetForm() {
    setValues(kosong());
    setDate("");
    setSedangEdit(null);
    setServerError(null);
  }

  function mulaiTambah() {
    resetForm();
    setFormTerbuka(true);
  }

  function mulaiEdit(t: DatedTemplate) {
    setSedangEdit(t.date);
    setDate(t.date);
    setValues({
      activity: t.activity,
      learning: t.learning,
      obstacles: t.obstacles,
    });
    setServerError(null);
    setFormTerbuka(true);
  }

  /** Ambil ulang daftar dari server agar tampilan = isi database. */
  async function muatUlang() {
    try {
      const res = await fetch("/api/report-templates/dated");
      if (!res.ok) return;
      const d = (await res.json()) as { templates?: DatedTemplate[] };
      setTemplates(d.templates ?? []);
    } catch {
      // Diamkan: daftar lama tetap tampil, pengguna bisa coba lagi.
    }
  }

  async function simpan() {
    if (!bisaSimpan) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await fetch("/api/report-templates/dated", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ...values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(data.error ?? "Gagal menyimpan. Coba lagi.");
        return;
      }
      toast.success(
        "Template tanggal tersimpan",
        "Dipakai hanya untuk tanggal ini, template harian tidak berubah.",
      );
      await muatUlang();
      resetForm();
      setFormTerbuka(false);
    } catch {
      setServerError("Tidak bisa menghubungi server. Periksa koneksi Anda.");
    } finally {
      setSaving(false);
    }
  }

  async function hapus(tanggal: string) {
    setDeleting(true);
    setServerError(null);
    try {
      const res = await fetch(
        `/api/report-templates/dated?date=${encodeURIComponent(tanggal)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(data.error ?? "Gagal menghapus. Coba lagi.");
        return;
      }
      setTemplates((prev) => prev.filter((t) => t.date !== tanggal));
      toast.success("Template tanggal dihapus", "Template harian tetap utuh.");
    } catch {
      setServerError("Tidak bisa menghubungi server. Periksa koneksi Anda.");
    } finally {
      setDeleting(false);
      setConfirmHapus(null);
    }
  }

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="font-heading text-xl">Template Khusus Tanggal Tertentu</h2>
        <p className="mt-1 text-sm text-foreground/70">
          Kosongkan saja bila tidak perlu. Bila diisi, isinya <b>hanya</b> dipakai
          untuk tanggal tersebut; tanggal lain tetap memakai template harian di
          atas. Catatan: otomasi tetap melewati Sabtu, Minggu, dan libur nasional.
        </p>
      </div>

      {serverError && (
        <div className="mb-4">
          <Message tone="bad">{serverError}</Message>
        </div>
      )}

      {templates.length > 0 && (
        <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
          {templates.map((t) => (
            <li
              key={t.date}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="font-medium tabular-nums">{t.date}</span>
              <StatusTanggal date={t.date} today={today} />
              <span className="text-foreground/60">
                {countReportLength(t.activity)}/{countReportLength(t.learning)}/
                {countReportLength(t.obstacles)} karakter
              </span>
              <span className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  onClick={() => mulaiEdit(t)}
                >
                  <Pencil className="mr-1 h-4 w-4" /> Ubah
                </Button>
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  onClick={() => setConfirmHapus(t.date)}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Hapus
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!formTerbuka && (
        <Button type="button" variant="neutral" onClick={mulaiTambah}>
          <CalendarPlus className="mr-1 h-4 w-4" /> Tambah template tanggal
        </Button>
      )}

      {formTerbuka && (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 max-w-xs">
            <Label htmlFor="dated-date">Tanggal</Label>
            <Input
              id="dated-date"
              type="date"
              value={date}
              // Tanggal dikunci saat menyunting: mengubahnya = baris lain, bukan
              // memindahkan yang ini. Lebih jujur: hapus lalu tambah baru.
              disabled={sedangEdit !== null}
              onChange={(e) => {
                setDate(e.target.value);
                setServerError(null);
              }}
            />
            {sedangEdit !== null && (
              <p className="mt-1 text-xs text-foreground/60">
                Tanggal tidak bisa diubah saat menyunting. Hapus lalu tambah baru
                bila perlu tanggal lain.
              </p>
            )}
            {date.trim() !== "" && isPlainDate(date) && (
              <div className="mt-2">
                <StatusTanggal date={date} today={today} />
              </div>
            )}
          </div>

          {FIELDS.map((f) => (
            <div key={f.name} className="mb-4">
              <Label htmlFor={`dated-${f.name}`}>{f.label}</Label>
              <p className="mb-1 text-xs text-foreground/60">{f.hint}</p>
              <Textarea
                id={`dated-${f.name}`}
                value={values[f.name]}
                onChange={(e) => {
                  setValues((prev) => ({ ...prev, [f.name]: e.target.value }));
                  setServerError(null);
                }}
                rows={4}
              />
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-foreground/60">
                  {status[f.name].panjang}/{MAX_REPORT_LENGTH} karakter (minimal{" "}
                  {MIN_REPORT_LENGTH})
                </span>
                {status[f.name].error ? (
                  <span className="text-destructive">{status[f.name].error}</span>
                ) : (
                  <span className="flex items-center gap-1 text-foreground/60">
                    <CircleCheck className="h-3.5 w-3.5" /> Siap
                  </span>
                )}
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!bisaSimpan}
              onClick={() => void simpan()}
            >
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button
              type="button"
              variant="neutral"
              disabled={saving}
              onClick={() => {
                resetForm();
                setFormTerbuka(false);
              }}
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmHapus !== null}
        onOpenChange={(buka) => {
          if (!buka) setConfirmHapus(null);
        }}
        title="Hapus template tanggal ini?"
        description={`Template untuk ${confirmHapus ?? ""} akan dihapus dan tanggal itu kembali memakai template harian. Riwayat laporan yang sudah terkirim tidak terpengaruh.`}
        confirmLabel={deleting ? "Menghapus…" : "Hapus"}
        confirmVariant="reverse"
        onConfirm={() => {
          if (confirmHapus) void hapus(confirmHapus);
        }}
      />
    </section>
  );
}

/** Penanda status sebuah tanggal: libur, sudah lewat, di luar program, siap. */
function StatusTanggal({ date, today }: { date: string; today: string }) {
  const programSelesai = isAfter(date, LAST_ACTIVE_DATE);
  const libur = isHoliday(date);
  const lewat = isAfter(today, date);
  const label = programSelesai
    ? "Di luar masa program"
    : libur
      ? "Libur, otomasi tidak mengirim"
      : lewat
        ? "Sudah lewat"
        : "Siap dipakai";
  return (
    <span className="rounded bg-muted px-2 py-0.5 text-xs text-foreground/70">
      {label}
    </span>
  );
}