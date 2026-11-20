"use client";

// src/components/ui/date-picker.tsx: pemilih tanggal satu-nilai.
//
// Kini dibangun dari komponen RESMI registry neobrutalism:
//   - <Popover> (src/components/ui/popover.tsx) sebagai cangkang popup,
//   - <Calendar> (src/components/ui/calendar.tsx, react-day-picker) sebagai kisi.
//
// Kenapa dulu ditulis tangan, dan apa yang tetap dipertahankan: peramban tidak
// mengizinkan menonaktifkan tanggal tertentu pada `<input type="date">`,
// sedangkan di sini tanggal yang tidak boleh dipilih (hari di luar jadwal kerja
// pengguna, libur nasional, dan tanggal LAMPAU) memang harus mati. Aturan itu
// diteruskan lewat matcher `disabled` react-day-picker, jadi perilakunya sama
// persis dengan sebelumnya, hanya kulitnya yang sekarang memakai komponen resmi.
//
// Aturan hari memakai `isWorkingDay` yang SAMA dengan jalur kirim (libur admin +
// jadwal kerja pengguna), dan hari ini dihitung dari jam perangkat, jadi tidak
// ada dua daftar yang bisa berbeda.
//
// BATAS TANGGAL: pemilih ini hanya boleh memilih HARI INI atau tanggal yang
// akan datang (lihat `disabledMatchers`), dan tombol "bulan sebelumnya" mati
// begitu berada di bulan berjalan. Ini cermin dari aturan server: laporan hanya
// sah untuk hari ini (lihat report-policy.ts).
//
// PENGECUALIAN: halaman yang SEDANG mengelola daftar libur (/admin/holidays)
// justru perlu memilih tanggal lampau DAN akhir pekan (libur nasional bisa
// jatuh pada Sabtu/Minggu), jadi di sana dioper `unrestricted` yang melepas
// seluruh pembatas. Halaman lain tetap memakai default (terbatas) supaya
// perilakunya tidak berubah: hanya HARI INI & tanggal mendatang, dan hanya
// hari kerja menurut jadwal pengguna (default Senin–Jumat) yang bukan libur.
//
// JADWAL KERJA: prop `workDays` (ISO 1=Senin … 7=Minggu) membuat tanggal di
// luar jadwal pengguna ikut nonaktif. Tanpa prop itu, Senin–Jumat (perilaku
// lama). Aturan dinonaktifkannya memakai `isWorkingDay` yang SAMA dengan jalur
// kirim, jadi tanggal yang tidak bisa dipilih mustahil berbeda dari tanggal
// yang benar-benar dilewati otomasi.

import { useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import type { Matcher } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MONTH_LABELS } from "@/lib/calendar";
import { isPlainDate, isWorkingDay } from "@/lib/report-policy";
import type { WorkDays } from "@/lib/work-schedule";

/** `YYYY-MM-DD` → Date lokal (tanpa pergeseran zona waktu). */
function toDate(iso: string | null): Date | undefined {
  if (!iso || !isPlainDate(iso)) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date lokal → `YYYY-MM-DD`. */
function toIso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Hari ini sebagai Date lokal tengah malam. */
function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Format tampilan: "2 Oktober 2026" (bahasa Indonesia, tanpa zona waktu). */
function formatDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_LABELS[m]} ${y}`;
}

export interface DatePickerProps {
  /** Nilai terpilih `YYYY-MM-DD`, atau kosong/null bila belum dipilih. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Nonaktifkan seluruh kontrol (mis. saat menyimpan). */
  disabled?: boolean;
  /** Teks saat belum ada tanggal. */
  placeholder?: string;
  id?: string;
  className?: string;
  /**
   * Daftar libur nasional dari tabel admin (`YYYY-MM-DD`). Bila diberikan,
   * tanggal ini juga dinonaktifkan.
   */
  holidays?: string[];
  /**
   * Hari kerja pemilik formulir (ISO 1=Senin … 7=Minggu). Bila diberikan,
   * tanggal di luar daftar ini dinonaktifkan, sama seperti akhir pekan pada
   * jadwal default. Tanpa prop ini → Senin–Jumat (perilaku lama).
   */
  workDays?: WorkDays;
  /**
   * Bila `true`, SEMUA pembatas dilepas (tanggal lampau, daftar libur, batas
   * bulan, akhir pekan, jadwal kerja), dipakai halaman yang SEDANG mengelola
   * daftar libur — termasuk untuk mendaftarkan libur nasional yang jatuh pada
   * Sabtu/Minggu. Default `false`.
   */
  unrestricted?: boolean;
}

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = "Pilih tanggal",
  id,
  className,
  holidays,
  workDays,
  unrestricted = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);

  // Matcher `disabled` react-day-picker: setiap tanggal lampau DAN setiap
  // tanggal yang bukan hari kerja menurut jadwal pengguna (libur nasional dari
  // admin ATAU hari di luar jadwal, termasuk Sabtu/Minggu pada jadwal default)
  // tidak bisa diklik. Satu predikat `isWorkingDay` memastikan aturannya
  // identik dengan jalur kirim; tidak ada dua daftar yang bisa berbeda.
  //
  // Bila `unrestricted` (halaman kelola libur), SEMUA pembatas dilepas: di
  // sana justru tanggal lampau & akhir pekan yang mau didaftarkan.
  //
  // `isWorkingDay` menuntut Set (ReadonlySet) untuk lookup O(1), jadi array
  // serializable dari server dibungkus sekali di sini.
  const disabledMatchers = useMemo<Matcher[]>(() => {
    if (unrestricted) return [];
    const batas = today();
    const libur = new Set(holidays ?? []);
    return [
      { before: batas },
      (date) => !isWorkingDay(toIso(date), libur, workDays),
    ];
  }, [holidays, unrestricted, workDays]);

  const bolehMundur = useMemo(() => {
    if (unrestricted) return undefined;
    const sekarang = today();
    const bulanAwal = new Date(sekarang.getFullYear(), sekarang.getMonth(), 1);
    return bulanAwal;
  }, [unrestricted]);

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          render={
            <Button
              type="button"
              variant="neutral"
              disabled={disabled}
              className="w-full justify-start text-left font-normal"
            >
              <CalendarIcon className="mr-2 size-4" aria-hidden />
              <span className={cn("truncate", !value && "text-muted-foreground")}>
                {value ? formatDisplay(value) : placeholder}
              </span>
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? today()}
            startMonth={bolehMundur}
            disabled={disabledMatchers}
            onSelect={(date) => {
              // Pagar kedua: jangan pernah mengirim tanggal kosong ke induk.
              if (!date) return;
              onChange(toIso(date));
              setOpen(false);
            }}
          />
          <div className="mt-2 flex items-center justify-between border-t-2 border-border px-3 pb-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer px-1 py-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="cursor-pointer px-1 py-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Kosongkan
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
