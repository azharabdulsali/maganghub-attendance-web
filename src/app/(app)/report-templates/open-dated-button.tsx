"use client";

// src/app/(app)/report-templates/open-dated-button.tsx
//
// Tombol "Buka" untuk satu baris di tabel template khusus tanggal.
//
// Kenapa jadi pulau klien tersendiri, bukan sekadar <Link> seperti sebelumnya:
//   1. Form di atas hanyalah client component yang membaca `?date=` SEKALI saat
//      pertama dipasang. Menekan <Link> ke rute yang sama dengan query baru
//      melakukan navigasi klien, TIDAK memuat ulang halaman, sehingga form
//      tetap memakai `initialDate` lama — inilah sebab "Buka" tampak tidak
//      melakukan apa-apa.
//   2. Setelah pindah, pengguna juga perlu dibawa ke form yang posisinya di
//      ATAS tabel. Tanpa menggulir, perubahan form di luar layar.
//
// Jadi tombol ini: `router.push` ke rute dengan `?date=`, lalu menggulir elemen
// form (id `report-templates-form`) ke pandangan. `router.refresh()` dipanggil
// agar server component halaman menghitung ulang `initialDate` dan menyerahkan
// nilai baru ke form.

import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";

/** id elemen pembungkus form, dipakai sebagai target gulir. */
export const FORM_ANCHOR_ID = "report-templates-form";

export function OpenDatedButton({ date }: { date: string }) {
  const router = useRouter();

  function buka() {
    router.push(`/report-templates?date=${encodeURIComponent(date)}`);
    // Gulir ke form setelah navigasi klien selesai pada frame berikutnya.
    requestAnimationFrame(() => {
      document
        .getElementById(FORM_ANCHOR_ID)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <Button
      type="button"
      variant="neutral"
      size="icon-sm"
      onClick={buka}
      title={`Buka template tanggal ${date}`}
      aria-label={`Buka template tanggal ${date}`}
    >
      <Pencil aria-hidden />
    </Button>
  );
}
