// src/lib/landing-sheet-gesture.ts: keputusan "geser lembar" di hero landing.
//
// Kenapa MURNI & terpisah dari komponen: ambang geser adalah satu-satunya
// bagian dari interaksi itu yang bisa salah TANPA TERLIHAT. Kibasan pendek
// yang cepat terasa disengaja oleh tangan, sedangkan seretan lambat sejauh dua
// sentimeter tidak — dan tidak ada cara memeriksanya lewat mata di layar.
// Memisahkannya ke sini membuat aturan itu bisa diuji dengan angka tetap,
// tanpa peramban, tanpa menunggu animasi selesai.
//
// Dipakai HANYA oleh `src/components/landing-report-sheet.tsx`. Jangan pakai
// untuk gestur lain: ambang di sini disetel untuk satu lembar kertas berukuran
// ~320 px, bukan untuk karusel layar penuh.

/** Jarak geser minimum (px) agar lembar berganti tanpa kibasan cepat. */
export const AMBANG_GESER_PX = 56;

/** Kecepatan lepas minimum (px/detik) agar kibasan pendek tetap dihitung. */
export const AMBANG_CEPAT_PX_PER_DETIK = 480;

/**
 * Arah perpindahan lembar.
 *
 * `1` = lembar berikutnya, `-1` = lembar sebelumnya, `0` = kembali ke tempat
 * semula (tidak ada yang berubah).
 */
export type ArahLembar = -1 | 0 | 1;

/**
 * Tentukan apa yang harus terjadi setelah jari/mouse dilepas, MURNI.
 *
 * Aturan yang dipakai:
 *
 * 1. **Kecepatan menang atas jarak.** Kibasan 20 px yang dilepas dengan
 *    kecepatan tinggi tetap terasa disengaja, jadi harus dihitung. Sebaliknya
 *    seretan lambat sejauh 40 px terasa seperti ragu-ragu, jadi dikembalikan.
 * 2. **Geser ke KIRI = lembar berikutnya**, meniru menyingkap kartu di atas
 *    tumpukan. Geser ke kanan = kembali ke lembar sebelumnya.
 * 3. **Nilai tidak masuk akal = tidak ada perubahan.** `NaN`/`Infinity` bisa
 *    muncul dari peramban yang aneh atau dari pemanggil yang salah; lebih baik
 *    lembar diam daripada melompat ke indeks acak.
 *
 * `offsetX` dan `velocityX` memakai tanda yang sama: negatif = ke kiri.
 */
export function arahGantiLembar(offsetX: number, velocityX: number): ArahLembar {
  if (!Number.isFinite(offsetX) || !Number.isFinite(velocityX)) return 0;

  const sinyal =
    Math.abs(velocityX) >= AMBANG_CEPAT_PX_PER_DETIK
      ? velocityX
      : Math.abs(offsetX) >= AMBANG_GESER_PX
        ? offsetX
        : 0;

  if (sinyal === 0) return 0;
  return sinyal < 0 ? 1 : -1;
}
