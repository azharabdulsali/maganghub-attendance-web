// src/app/(app)/admin/holidays/format.ts: format tanggal libur (MURNI, klien).
//
// Kenapa di file terpisah: dipakai komponen klien untuk menampilkan tanggal &
// nama hari. Perhitungan hari TIDAK memakai zona server/peramban (`new Date`
// lokal) melainkan UTC pada tanggal polos, sama seperti `holidayKindOf` di
// calendar.ts, sehingga Sabtu/Minggu tidak pernah bergeser.

const HARI = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/** Pecah `YYYY-MM-DD` → komponen angka, atau null bila bentuknya tak sah. */
function parts(date: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return {
    y: Number.parseInt(match[1], 10),
    m: Number.parseInt(match[2], 10),
    d: Number.parseInt(match[3], 10),
  };
}

/** "24 Desember 2026" dari `YYYY-MM-DD`. Tak sah → teks asli apa adanya. */
export function formatHolidayDate(date: string): string {
  const p = parts(date);
  if (!p) return date;
  return `${p.d} ${BULAN[p.m - 1]} ${p.y}`;
}

/** Nama hari ("Kamis") dari `YYYY-MM-DD`; tak sah → string kosong. */
export function weekdayLabelOf(date: string): string {
  const p = parts(date);
  if (!p) return "";
  const idx = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return HARI[idx];
}
