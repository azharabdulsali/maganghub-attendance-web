"use client";

// src/app/(app)/report-templates/report-templates-form.tsx — form 3 template.
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
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface Props {
  hasExisting: boolean;
  initialActivity: string;
  initialLearning: string;
  initialObstacles: string;
  updatedAt: string | null;
}

export default function ReportTemplatesForm({
  hasExisting,
  initialActivity,
  initialLearning,
  initialObstacles,
  updatedAt,
}: Props) {
  const [values, setValues] = useState<Record<FieldName, string>>({
    activity: initialActivity,
    learning: initialLearning,
    obstacles: initialObstacles,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(updatedAt);
  const [exists, setExists] = useState(hasExisting);
  const [confirmHapusOpen, setConfirmHapusOpen] = useState(false);
  const toast = useToast();

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

  async function simpan() {
    if (!semuaValid || saving) return;
    setSaving(true);
    setServerError(null);

    try {
      const res = await fetch("/api/report-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setServerError(data.error ?? "Gagal menyimpan. Coba lagi.");
        return;
      }

      setExists(true);
      setSavedAt(data.updatedAt ?? new Date().toISOString());
      toast.success("Template tersimpan", "Absensi otomatis memakai isi terbaru.");
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

    try {
      const res = await fetch("/api/report-templates", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const pesan = data.error ?? "Gagal menghapus. Coba lagi.";
        setServerError(pesan);
        toast.error("Gagal menghapus template", pesan);
        return;
      }

      setValues({ activity: "", learning: "", obstacles: "" });
      setExists(false);
      setSavedAt(null);
      toast.success("Template dihapus", "Isi template sudah dikosongkan.");
    } catch {
      const pesan = "Tidak bisa menghubungi server. Periksa koneksi Anda.";
      setServerError(pesan);
      toast.error("Gagal menghapus template", pesan);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Ringkasan status penyimpanan */}
      <div className="border-2 border-border bg-secondary-background px-4 py-3 shadow-shadow">
        <p className="flex items-center gap-2 text-sm">
          {exists ? (
            <>
              <CircleCheck className="size-4 shrink-0 text-foreground" aria-hidden />
              <span>
                Template tersimpan
                {savedAt
                  ? ` — terakhir diubah ${new Date(savedAt).toLocaleString("id-ID")}`
                  : null}
              </span>
            </>
          ) : (
            <>
              <TriangleAlert className="size-4 shrink-0 text-foreground/70" aria-hidden />
              <span>Belum ada template tersimpan</span>
            </>
          )}
        </p>
      </div>

      {FIELDS.map((f) => {
        const s = status[f.name];
        const kurang = MIN_REPORT_LENGTH - s.panjang;
        // Merah kalau sudah mulai diketik tapi belum cukup; teks normal
        // (tanpa warna khusus) kalau sudah memenuhi syarat — status "lolos"
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
          penuh dan terlihat jauh lebih besar dari "Hapus" di sebelahnya —
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
            : exists
              ? "Perbarui template"
              : "Simpan template"}
        </Button>

        {exists ? (
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
        title="Hapus ketiga template?"
        description="Tindakan ini tidak bisa dibatalkan. Tanpa template, absensi otomatis tidak bisa dijalankan."
        confirmLabel="Hapus template"
        onConfirm={() => void hapus()}
      />
    </div>
  );
}
