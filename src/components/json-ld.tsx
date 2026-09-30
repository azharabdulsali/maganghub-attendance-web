// src/components/json-ld.tsx: menyisipkan data terstruktur schema.org.
//
// Memakai <Script> dari next/script dengan type "application/ld+json", BUKAN
// <script> mentah: React 19 menolak elemen <script> telanjang di pohon
// komponen (lihat catatan yang sama di src/app/layout.tsx). Data terstruktur
// harus ada di HTML awal agar Rich Results Test dan Googlebot melihatnya,
// sehingga strategi `afterInteractive` (default) sudah memadai.
//
// Isi `data` selalu objek literal dari kode kita sendiri, bukan masukan
// pengguna, jadi aman di-JSON.stringify.

import Script from "next/script";

export function JsonLd({ id, data }: { id: string; data: Record<string, unknown> }) {
  return (
    <Script
      id={id}
      type="application/ld+json"
      // dangerouslySetInnerHTML adalah cara Next.js mendokumentasikan JSON-LD:
      // isinya JSON statis, bukan HTML yang bisa disuntik.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
