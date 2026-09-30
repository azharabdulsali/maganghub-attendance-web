// src/app/terms/page.tsx: Syarat & Ketentuan publik (audit C-2).
//
// Ditulis sesuai kenyataan proyek: ini alat bantu pribadi yang mengirim laporan
// ATAS NAMA pengguna ke portal Monev Kemnaker. Karena itu bagian terpenting di
// sini adalah tanggung jawab pengguna dan batas tanggung jawab pengelola:
// aplikasi bergantung pada portal pihak ketiga yang bisa berubah kapan saja.
//
// Sama seperti /privacy, halaman ini mengikuti gaya penulisan jujur proyek
// (lihat ai-writing-detection.md): tanpa klaim berlebihan, tanpa "kami sangat
// senang membantu", dan menyebut batasan apa adanya.

import type { Metadata } from "next";
import { LastUpdated, LegalPage, Section, ContactBlock } from "@/components/legal-page";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan",
  description:
    "Aturan pemakaian MagangHub: tanggung jawab pengguna, batas tanggung " +
    "jawab pengelola, dan ketergantungan pada portal Monev Kemnaker.",
  alternates: { canonical: "/terms" },
  openGraph: {
    type: "article",
    locale: "id_ID",
    siteName: SITE_NAME,
    title: `Syarat & Ketentuan | ${SITE_NAME}`,
    description:
      "Aturan pemakaian MagangHub: tanggung jawab pengguna, batas tanggung " +
      "jawab pengelola, dan ketergantungan pada portal Monev Kemnaker.",
    url: "/terms",
  },
};

export default function TermsPage() {
  return (
    <LegalPage
      judul="Syarat & Ketentuan"
      ringkas={
        `Dengan menggunakan ${SITE_NAME}, Anda menyetujui syarat berikut. ` +
        "Bacalah bagian tanggung jawab dan batas tanggung jawab dengan saksama."
      }
    >
      <LastUpdated date="5 Februari 2026" />

      <Section nomor="1" judul="Layanan ini apa">
        <p>
          {SITE_NAME} adalah alat bantu yang mengirim absensi dan laporan harian
          ke portal Monev MagangHub Kemnaker memakai kredensial yang Anda
          berikan, berdasarkan tiga template laporan yang Anda tulis sendiri.
          Aplikasi ini tidak menulis isi laporan menggantikan Anda.
        </p>
      </Section>

      <Section nomor="2" judul="Tanggung jawab Anda">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Anda bertanggung jawab menjaga kerahasiaan kata sandi akun aplikasi
            ini maupun kata sandi Monev Anda.
          </li>
          <li>
            Anda bertanggung jawab atas kebenaran isi laporan yang dikirim, dan
            memastikan pemakaian alat ini sesuai aturan instansi Anda.
          </li>
          <li>
            Anda tidak boleh memakai layanan ini untuk mengakses akun milik
            orang lain tanpa izin.
          </li>
        </ul>
      </Section>

      <Section nomor="3" judul="Ketergantungan pada portal pihak ketiga">
        <p>
          Pengiriman bergantung sepenuhnya pada portal Monev Kemnaker, yang
          dikelola pihak lain dan bisa berubah kapan saja tanpa pemberitahuan.
          Bila portal berubah atau menolak suatu permintaan, pengiriman bisa
          gagal. Bila itu terjadi, Anda tetap bisa menyalin isi template dan
          mengirimnya manual dari situs Monev.
        </p>
      </Section>

      <Section nomor="4" judul="Batas tanggung jawab">
        <p>
          Layanan ini disediakan &quot;sebagaimana adanya&quot; tanpa jaminan
          apa pun. Pengelola tidak bertanggung jawab atas laporan yang gagal
          terkirim, atas akibat kelalaian menjaga kredensial, maupun atas
          kerugian yang timbul dari pemakaian aplikasi ini. Gunakan dengan
          penilaian Anda sendiri.
        </p>
      </Section>

      <Section nomor="5" judul="Perubahan syarat">
        <p>
          Syarat ini bisa diperbarui sewaktu-waktu. Tanggal &quot;Terakhir
          diperbarui&quot; di atas akan mengikuti perubahan terbaru.
        </p>
      </Section>

      <Section nomor="6" judul="Hubungi kami">
        <ContactBlock />
      </Section>
    </LegalPage>
  );
}
