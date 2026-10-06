"use client";

// src/components/ui/date-picker.tsx: pemilih tanggal satu-nilai.
//
// Kini dibangun dari komponen RESMI registry neobrutalism:
//   - <Popover> (src/components/ui/popover.tsx) sebagai cangkang popup,
//   - <Calendar> (src/components/ui/calendar.tsx, react-day-picker) sebagai kisi.
//
// Kenapa dulu ditulis tangan, dan apa yang tetap dipertahankan: peramban tidak
// mengizinkan menonaktifkan tanggal tertentu pada `<input type="date">`,
// sedangkan di sini tanggal LIBUR (Sabtu/Minggu + libur nasional) dan tanggal
// LAMPAU (sebelum hari ini) memang tidak boleh dipilih. Aturan itu diteruskan
// lewat matcher `disabled` react-day-picker, jadi perilakunya sama persis
// dengan sebelumnya — hanya kulitnya yang sekarang memakai komponen resmi.
//
// Aturan libur memakai `isHoliday` yang SAMA dengan jalur kirim, dan hari ini
// dihitung dari jam perangkat, jadi tidak ada dua daftar yang bisa berbeda.
//
// BATAS TANGGAL: pemilih ini hanya boleh memilih HARI INI atau tanggal yang
// akan datang (lihat `disabledMatchers`), dan tombol "bulan sebelumnya" mati
// begitu berada di bulan berjalan. Ini cermin dari aturan server: laporan hanya
// sah untuk hari ini (lihat report-policy.ts).
//
// PENGECUALIAN: halaman yang SEDANG mengelola daftar libur (/admin/holidays)
// justru perlu memilih tanggal lampau/Sabtu/Minggu, jadi di sana dioper
// `unrestricted` — semua pembatas dilepas. Halaman lain tetap memakai default
// (terbatas) supaya perilakunya tidak berubah.

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
import { isHoliday, isPlainDate } from "@/lib/report-policy";

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
   * Bila `true`, semua pembatas tanggal dilepas: tanggal LAMPAU, Sabtu/Minggu,
   * dan libur semuanya bisa dipilih, dan pengguna bisa berpindah ke bulan mana
   * pun (termasuk ke belakang). Dipakai pada halaman yang justru DAFTAR
   * tanggalnya sedang dikelola (mis. `/admin/holidays`), sehingga menonaktifkan
   * hari libur di sana akan kontraproduktif. Default `false`.
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
  unrestricted = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);

  // Matcher `disabled` react-day-picker: setiap tanggal lampau DAN setiap
  // tanggal libur (Sabtu/Minggu + libur dari admin) tidak bisa diklik. Ini
  // pengganti langsung dari pengecekan `libur`/`lampau` versi lama.
  //
  // Bila `unrestricted` (halaman kelola libur), tak satu pun dipasang: di sana
  // justru Sabtu/Minggu & tanggal lampau yang mau didaftarkan sebagai libur.
  //
  // `isHoliday` menuntut Set (ReadonlySet) untuk lookup O(1), jadi array
  // serializable dari server dibungkus sekali di sini.
  const disabledMatchers = useMemo<Matcher[]>(() => {
    if (unrestricted) return [];
    const batas = today();
    const libur = new Set(holidays ?? []);
    return [
      { before: batas },
      (date) => date.getDay() === 0 || date.getDay() === 6,
      (date) => isHoliday(toIso(date), libur),
    ];
  }, [holidays, unrestricted]);

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
              <span className={cn("truncate", !value && "text-foreground/50")}>
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
              className="cursor-pointer text-xs text-foreground/60 underline underline-offset-4 hover:text-foreground"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="cursor-pointer text-xs text-foreground/60 underline underline-offset-4 hover:text-foreground"
            >
              Kosongkan
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
