"use client";

// src/components/ui/date-picker.tsx: pemilih tanggal satu-nilai (popup kalender).
//
// Kenapa dibuat sendiri, bukan `<input type="date">`: peramban tidak mengizinkan
// kita menonaktifkan tanggal tertentu pada input bawaan, sedangkan di sini
// tanggal LIBUR (Sabtu/Minggu + libur nasional) dan tanggal LAMPAU (sebelum hari
// ini) memang tidak boleh dipilih.
// Popup ini memakai perhitungan kalender yang SAMA dengan halaman /calendar
// (`MONTH_LABELS`, `WEEKDAY_LABELS`) dan aturan libur yang SAMA dengan jalur
// kirim (`isHoliday`), jadi tanggal yang dinonaktifkan di sini pasti tanggal
// yang memang dilewati otomasi, tidak ada dua daftar yang bisa berbeda.
//
// Berbeda dari /calendar, kisi di sini TIDAK mengosongkan sel padding: hari
// dari bulan sebelah tetap ditampilkan (redup) supaya kisi terlihat utuh.
//
// BATAS TANGGAL: pemilih ini hanya boleh memilih HARI INI atau tanggal yang
// akan datang. Tanggal sebelum hari ini diredupkan dan TIDAK bisa diklik sama
// sekali (lihat `lampau` di bawah), dan panah "bulan sebelumnya" dimatikan
// begitu sudah di bulan berjalan supaya pengguna tidak bisa menggulir ke masa
// lalu lewat navigasi bulan. Aturan ini cermin dari aturan server: laporan
// hanya sah untuk hari ini (lihat report-policy.ts).
//
// Batas tanggung jawab: komponen ini murni UI + perhitungan tanggal murni. Ia
// TIDAK tahu soal server, tidak memvalidasi, dan tidak menyimpan apa pun.

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildMonthGridWithAdjacent,
  MONTH_LABELS,
  WEEKDAY_LABELS,
  type YearMonth,
} from "@/lib/calendar";
import { isHoliday, isPlainDate } from "@/lib/report-policy";

/** Rombak `YYYY-MM-DD` menjadi YearMonth, atau null bila tidak sah. */
function toYearMonth(iso: string): YearMonth | null {
  if (!isPlainDate(iso)) return null;
  const [y, m] = iso.split("-").map(Number);
  return { year: y, month: m };
}

/** Bulan berjalan menurut jam perangkat (kisi baru butuh bulan awal). */
function todayYearMonth(): YearMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Tanggal hari ini sebagai `YYYY-MM-DD` lokal perangkat. */
function todayIso(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Format tampilan: "2 Oktober 2026" (bahasa Indonesia, tanpa zona waktu). */
function formatDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_LABELS[m]} ${y}`;
}

/**
 * `true` bila `iso` jatuh SEBELUM hari ini. Keduanya `YYYY-MM-DD`, jadi
 * perbandingan leksikografis sama dengan perbandingan kronologis.
 */
function isBeforeToday(iso: string, today: string): boolean {
  return iso < today;
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
   * tanggal ini juga dinonaktifkan — sejalan dengan `decide()` di server.
   * Bila tidak, hanya daftar statis bawaan yang dipakai (pemanggil murni).
   */
  holidays?: ReadonlySet<string>;
}

export function DatePicker({
  value,
  onChange,
  disabled = false,
  placeholder = "Pilih tanggal",
  id,
  className,
  holidays,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  // Bulan yang sedang ditampilkan di popup. Ikut nilai terpilih bila ada.
  const [view, setView] = useState<YearMonth>(
    () => (value ? toYearMonth(value) : null) ?? todayYearMonth(),
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  // Buka popup → hitung bulan yang ditampilkan di handler (bukan di efek),
  // agar tidak memicu cascading render.
  function toggleOpen() {
    if (!open) {
      setView((value ? toYearMonth(value) : null) ?? todayYearMonth());
    }
    setOpen((v) => !v);
  }

  // Tutup saat klik di luar atau tekan Escape.
  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const weeks = buildMonthGridWithAdjacent(view);
  const today = todayIso();

  function pilih(iso: string) {
    // Pagar kedua: walau tombolnya sudah `disabled`, jangan pernah mengirim
    // tanggal lampau ke induk. Aturan ini cermin dari validasi server.
    if (isBeforeToday(iso, today)) return;
    onChange(iso);
    setOpen(false);
  }

  function geser(delta: number) {
    setView((prev) => {
      const bulan = prev.month + delta;
      if (bulan < 1) return { year: prev.year - 1, month: 12 };
      if (bulan > 12) return { year: prev.year + 1, month: 1 };
      return { year: prev.year, month: bulan };
    });
  }

  // Panah "bulan sebelumnya" dimatikan begitu sudah di bulan berjalan, supaya
  // pengguna tidak bisa menggulir ke masa lalu lewat navigasi bulan.
  const bulanIni = todayYearMonth();
  const bolehMundur = view.year > bulanIni.year || (view.year === bulanIni.year && view.month > bulanIni.month);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Button
        id={id}
        type="button"
        variant="neutral"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleOpen}
        className="w-full justify-start text-left font-normal"
      >
        <Calendar className="mr-2 size-4" aria-hidden />
        <span className={cn("truncate", !value && "text-foreground/50")}>
          {value ? formatDisplay(value) : placeholder}
        </span>
      </Button>



      {open ? (
        <div
          role="dialog"
          aria-label="Pilih tanggal"
          className="absolute z-50 mt-2 w-[280px] rounded-base border-2 border-border bg-background p-3 shadow-shadow"
        >
          {/* Navigasi bulan. */}
          <div className="mb-2 flex items-center justify-between">
            <Button
              type="button"
              variant="noShadow"
              size="icon-sm"
              title="Bulan sebelumnya"
              aria-label="Bulan sebelumnya"
              disabled={!bolehMundur}
              onClick={() => geser(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="font-heading text-sm">
              {MONTH_LABELS[view.month]} {view.year}
            </span>
            <Button
              type="button"
              variant="noShadow"
              size="icon-sm"
              title="Bulan berikutnya"
              aria-label="Bulan berikutnya"
              onClick={() => geser(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* Nama hari. */}
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAY_LABELS.map((label) => (
              <span
                key={label}
                className="py-1 text-center text-[10px] font-heading text-foreground/50"
              >
                {label}
              </span>
            ))}
          </div>

          {/* Kisi tanggal. Hari dari bulan sebelah ditampilkan redup; tanggal
              sebelum hari ini TIDAK bisa diklik (lihat `lampau`). */}
          <div className="grid grid-cols-7 gap-0.5">
            {weeks.flat().map((cell) => {
              const libur = isHoliday(cell.iso, holidays);
              const lampau = isBeforeToday(cell.iso, today);
              const terpilih = cell.iso === value;
              const isToday = cell.iso === today;
              const nonaktif = libur || lampau;
              const [cellYear, cellMonth] = cell.iso.split("-").map(Number);
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={nonaktif}
                  aria-label={`${cell.day} ${MONTH_LABELS[cellMonth]} ${cellYear}${
                    libur ? ", libur" : lampau ? ", sudah lewat" : ""
                  }`}
                  aria-pressed={terpilih}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => pilih(cell.iso)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-sm text-xs tabular-nums transition-colors",
                    libur
                      ? "cursor-not-allowed text-foreground/25 line-through"
                      : lampau
                        ? "cursor-not-allowed text-foreground/25"
                        : "cursor-pointer hover:bg-muted",
                    // Bulan sebelah: tetap ditampilkan, hanya dibedakan warnanya.
                    !nonaktif && (cell.outside ? "text-foreground/40" : "text-foreground/80"),
                    isToday && !terpilih && "font-heading underline underline-offset-2",
                    terpilih && "bg-main text-main-foreground hover:bg-main",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Aksi cepat. */}
          <div className="mt-2 flex items-center justify-between border-t-2 border-border pt-2">
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
        </div>
      ) : null}
    </div>
  );
}
