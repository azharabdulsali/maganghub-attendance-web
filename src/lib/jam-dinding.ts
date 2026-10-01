// src/lib/jam-dinding.ts: pemformatan jam dinding untuk WIB (Waktu Indonesia Barat).
//
// Kenapa helper terpisah & murni:
//   Format jam adalah logika yang gampang salah (zona waktu, padding, hari).
//   Dengan dipisah dari komponen React, ia bisa diuji tanpa DOM (lihat
//   src/lib/jam-dinding.test.ts) dan komponen tinggal memanggilnya.
//
// Kenapa WIB dikunci eksplisit (bukan zona server/pengguna):
//   Aplikasi ini untuk magang di Kemnaker, jadi acuan waktu yang benar adalah
//   WIB. Tanpa zona tetap, pengguna di perangkat berlokasi lain (atau server
//   UTC) akan melihat jam yang menyesatkan. Server Vercel berjalan di UTC,
//   jadi mengunci "Asia/Jakarta" membuat tampilan sama di mana pun.

/** Zona waktu acuan tampilan jam. */
export const ZONA_WIB = "Asia/Jakarta" as const;

/**
 * Membentuk dua bagian tampilan dari satu `Date`:
 *   - `tanggal` : "Sen, 29 Sep"
 *   - `jam`     : "14:32:07"
 *
 * Memakai `Intl.DateTimeFormat` (bawaan, tanpa paket). Dua jebakan yang
 * ditangani di sini:
 *   1. Locale `id-ID` memakai TITIK sebagai pemisah jam ("14.32.07"), bukan
 *      titik dua. Kita rangkai sendiri dari `formatToParts` supaya hasilnya
 *      selalu "HH:MM:SS" apa pun locale mesin/klien.
 *   2. `h24` bisa menghasilkan "24:00:00" di tengah malam. Kita pakai `h23`
 *      agar tengah malam = "00:00:00".
 */
export function formatJamWib(saat: Date): { tanggal: string; jam: string } {
  const tanggal = new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: ZONA_WIB,
  }).format(saat);

  const jamFormat = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone: ZONA_WIB,
  });

  // Ambil HANYA komponen angka, lalu rangkai dengan ":" sendiri.
  const angka: Record<string, string> = {};
  for (const bagian of jamFormat.formatToParts(saat)) {
    if (bagian.type === "hour" || bagian.type === "minute" || bagian.type === "second") {
      angka[bagian.type] = bagian.value.padStart(2, "0");
    }
  }
  const jam = `${angka.hour}:${angka.minute}:${angka.second}`;

  return { tanggal, jam };
}

/** Label zona yang ditampilkan setelah jam, mis. "WIB". */
export const LABEL_ZONA = "WIB" as const;
