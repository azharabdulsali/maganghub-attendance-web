"use client";

// src/app/(app)/work-schedule/work-schedule-form.tsx: form centang hari kerja.
//
// Satu-satunya tempat pengguna mengubah jadwal kerjanya. Aturan hari (ISO
// 1=Senin … 7=Minggu, default Senin–Jumat, minimal satu hari) tinggal di
// src/lib/work-schedule.ts dan skema Zod di src/lib/validate.ts, sehingga tidak
// ada aturan yang ditulis ulang di sini.
//
// Kenapa `baseline` terpisah dari `days`: setelah simpan, pembanding "ada
// perubahan belum disimpan" harus memakai isi yang benar-benar TERSIMPAN,
// bukan state yang sedang disunting. Tanpa itu, guard `beforeunload` bisa mati
// tepat saat ada perubahan yang belum disimpan.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import { useToast } from "@/components/ui/toast";
import { useUnsavedGuard } from "@/lib/form-guard";
import {
  DEFAULT_WORK_DAYS,
  WORK_DAY_LABELS,
  describeWorkDays,
  normalizeWorkDays,
  sameWorkDays,
  type WorkDay,
} from "@/lib/work-schedule";

/** Urutan tampil: Senin → Minggu. */
const DAYS: readonly WorkDay[] = [1, 2, 3, 4, 5, 6, 7];

type Props = {
  /** Hari kerja tersimpan (atau default bila belum pernah diatur). */
  initialDays: WorkDay[];
  /** false = belum ada baris tersimpan, yang tampil adalah default. */
  hasExisting: boolean;
};

export default function WorkScheduleForm({ initialDays, hasExisting }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [baseline, setBaseline] = useState<WorkDay[]>(initialDays);
  const [days, setDays] = useState<WorkDay[]>(initialDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kotor = !sameWorkDays(baseline, days);
  useUnsavedGuard(kotor);

  const kosong = days.length === 0;

  function ubah(day: WorkDay, checked: boolean) {
    setDays((prev) =>
      checked
        ? normalizeWorkDays([...prev, day])
        : prev.filter((d) => d !== day),
    );
    setError(null);
  }

  async function simpan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    // Pagar di UI, cermin dari skema Zod (minimal satu hari). Server tetap
    // menolak daftar kosong walau pagar ini dilewati.
    if (kosong) {
      setError("Pilih minimal satu hari kerja.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/work-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        days?: WorkDay[];
        error?: string;
      };

      if (!res.ok) {
        const pesan =
          data.error ?? "Jadwal kerja belum tersimpan. Coba lagi sebentar.";
        setError(pesan);
        toast.error("Gagal menyimpan jadwal kerja", pesan);
        return;
      }

      const tersimpan = normalizeWorkDays(data.days ?? days);
      setDays(tersimpan);
      setBaseline(tersimpan);
      toast.success(
        "Jadwal kerja tersimpan",
        `Hari kerja Anda: ${describeWorkDays(tersimpan)}.`,
      );
      // Ringkasan di halaman lain (dashboard, kalender) dibaca ulang dari
      // server, jadi minta Next.js menyegarkan data tanpa memuat ulang halaman.
      router.refresh();
    } catch {
      const pesan =
        "Jadwal kerja belum tersimpan karena koneksi terputus. Periksa internet Anda lalu coba lagi.";
      setError(pesan);
      toast.error("Gagal menyimpan jadwal kerja", pesan);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={simpan} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Hari kerja Anda</CardTitle>
          <CardDescription>
            {hasExisting
              ? "Centang hari Anda bekerja. Absensi otomatis hanya dikirim pada hari yang dicentang."
              : "Anda belum pernah mengatur jadwal, jadi yang berlaku adalah Senin–Jumat. Ubah bila hari kerja Anda berbeda."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset>
            <legend className="sr-only">Pilih hari kerja</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DAYS.map((day) => {
                const dicentang = days.includes(day);
                return (
                  <div key={day} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`hari-${day}`}
                      checked={dicentang}
                      disabled={saving}
                      onCheckedChange={(checked) =>
                        ubah(day, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`hari-${day}`}
                      className="cursor-pointer select-none"
                    >
                      {WORK_DAY_LABELS[day]}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <p className="text-sm">
            Ringkasan:{" "}
            <strong className="font-heading">{describeWorkDays(days)}</strong>
          </p>

          {/* Hari libur nasional tetap dilewati walau harinya dicentang. Ini
              sering ditanyakan, jadi disebut di tempat pengguna memilih. */}
          <p className="text-xs text-muted-foreground">
            Hari libur nasional dan tanggal setelah akhir masa program tetap
            dilewati walau harinya dicentang. Tanggal lampau tidak bisa dikirim.
          </p>

          {kosong && (
            <Message tone="bad">
              Pilih minimal satu hari kerja. Tanpa hari kerja, laporan tidak
              akan pernah terkirim.
            </Message>
          )}

          {error && <Message tone="bad">{error}</Message>}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="success"
              disabled={saving || kosong || !kotor}
              title={saving ? "Menyimpan…" : "Simpan jadwal kerja"}
              aria-label={saving ? "Menyimpan" : "Simpan jadwal kerja"}
            >
              {saving ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Save aria-hidden />
              )}
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
            <Button
              type="button"
              variant="neutral"
              disabled={saving || sameWorkDays(days, DEFAULT_WORK_DAYS)}
              onClick={() => {
                setDays([...DEFAULT_WORK_DAYS]);
                setError(null);
              }}
              title="Kembalikan ke Senin–Jumat"
              aria-label="Kembalikan ke Senin–Jumat"
            >
              <RotateCcw aria-hidden />
              Senin–Jumat
            </Button>
          </div>

          {!kotor && hasExisting && (
            <p className="text-xs text-muted-foreground">
              Jadwal tersimpan sama dengan yang tampil.
            </p>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
