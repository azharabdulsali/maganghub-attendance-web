"use client";

// src/lib/form-guard.ts: peringatan "perubahan belum disimpan".
//
// Hook ini dipasang di form yang panjang/lama diisi (mis. tiga kolom template
// laporan, masing-masing >100 karakter). Tanpa guard, menutup tab atau pindah
// halaman lewat navigasi browser begitu saja MEMBUANG pekerjaan satu jam tanpa
// peringatan apa pun; itu kerugian nyata, bukan teoretis, karena isinya
// teks panjang yang tidak bisa "dikembalikan" oleh undo browser.
//
// Cara kerja:
//   - `kotor = true` berarti form sedang berisi perubahan yang belum disimpan.
//     Sementara kotor, event `beforeunload` dipasang → browser bawaan
//     menampilkan dialognya sendiri saat penutupan tab/refresh.
//   - Navigasi DALAM aplikasi (klik tautan Next.js) tidak bisa dicegat
//     `beforeunload`, karena React Router/Next App Router tidak memicunya.
//     Guard dalam-aplikasi justru membuat pengguna harus dua kali mengonfirmasi,
//     jadi TIDAK dipasang — ini keputusan sadar: cakupan guard hanya keluar
//     aplikasi (tutup tab, refresh, pindah situs), di mana pekerjaan benar-benar
//     hilang tanpa bisa "kembali".
//
// MURNI (fungsi `apakahKotor`): bisa diuji di Node tanpa DOM. Hook-nya tipis.

import { useEffect } from "react";

/**
 * Bandingkan isi form dengan nilai awalnya: kotor bila ADA kolom yang
 * berbeda setelah trim. Beda spasi di tengah tetap dihitung (bukan hanya
 * berbeda whitespace di pinggir).
 *
 * MURNI, teruji di form-guard.test.ts.
 */
export function apakahKotor(
  awal: Record<string, string>,
  kini: Record<string, string>,
): boolean {
  const kunci = new Set([...Object.keys(awal), ...Object.keys(kini)]);
  for (const k of kunci) {
    if ((awal[k] ?? "").trim() !== (kini[k] ?? "").trim()) return true;
  }
  return false;
}

/**
 * Pasang `beforeunload` sementara `kotor` bernilai true.
 *
 * @param kotor true bila ada perubahan yang belum disimpan.
 */
export function useUnsavedGuard(kotor: boolean): void {
  useEffect(() => {
    if (!kotor) return;
    function sebelumBongkar(e: BeforeUnloadEvent) {
      // Standar modern: mencegah default + set returnValue → browser menampilkan
      // dialognya. `preventDefault` saja tidak cukup di semua peramban.
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", sebelumBongkar);
    return () => window.removeEventListener("beforeunload", sebelumBongkar);
  }, [kotor]);
}



