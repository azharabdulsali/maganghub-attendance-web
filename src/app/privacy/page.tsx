// src/app/privacy/page.tsx: Kebijakan Privasi publik (audit C-2).
//
// Ditulis berdasarkan data yang BENAR-BENAR disimpan aplikasi ini (lihat
// prisma/schema.prisma dan AGENTS.md), bukan teks template generik:
//   - User: email, passwordHash (hash satu arah), nama opsional
//   - MaganghubCredential: email + password Monev TERENKRIPSI AES-256-GCM
//   - ReportTemplate: tiga teks laporan milik pengguna
//   - Report/SubmitLog: riwayat pengiriman (status, waktu, respons portal)
//   - AutomationConfig: pengaturan jadwal + webhookKey per pengguna
//
// Halaman ini sengaja menyebut batasan secara jujur: kredensial Monev harus
// bisa didekripsi untuk dipakai login ke portal, jadi pengelola SECARA TEKNIS
// mampu membukanya. Menyembunyikan fakta ini akan menyesatkan, dan itu
// bertentangan dengan prinsip keterbukaan yang dipakai di seluruh proyek.

import type { Metadata } from "next";
import { LastUpdated, LegalPage, Section, ContactBlock } from "@/components/legal-page";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description:
    "Data apa yang disimpan MagangHub, bagaimana kredensial Monev dilindungi " +
    "dengan AES-256-GCM, dan hak Anda atas data tersebut.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "article",
    locale: "id_ID",
    siteName: SITE_NAME,
    title: `Kebijakan Privasi | ${SITE_NAME}`,
    description:
      "Data apa yang disimpan MagangHub, bagaimana kredensial Monev dilindungi " +
      "dengan AES-256-GCM, dan hak Anda atas data tersebut.",
    url: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      judul="Kebijakan Privasi"
      ringkas={
        `${SITE_NAME} membantu peserta magang Kemnaker mengirim absensi dan ` +
        "laporan Monev. Halaman ini menjelaskan data apa yang kami simpan, " +
        "bagaimana data itu dilindungi, dan hak Anda atasnya."
      }
    >
      <LastUpdated date="5 Februari 2026" />

      <Section nomor="1" judul="Data yang kami kumpulkan">
        <p>Kami hanya menyimpan data yang dibutuhkan agar aplikasi berfungsi:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Akun aplikasi:</strong> alamat email dan kata sandi. Kata
            sandi disimpan sebagai hash satu arah, jadi tidak ada yang bisa
            membacanya kembali, termasuk pengelola.
          </li>
          <li>
            <strong>Kredensial Monev:</strong> email dan kata sandi akun portal
            MagangHub Kemnaker Anda, disimpan terenkripsi AES-256-GCM.
          </li>
          <li>
            <strong>Isi laporan:</strong> tiga teks yang Anda tulis di template
            (Uraian Aktivitas, Pembelajaran, dan Kendala).
          </li>
          <li>
            <strong>Riwayat pengiriman:</strong> status, waktu, dan respons
            portal saat laporan dikirim.
          </li>
          <li>
            <strong>Pengaturan jadwal:</strong> pilihan manual atau otomatis,
            beserta kunci webhook pribadi Anda.
          </li>
        </ul>
      </Section>

      <Section nomor="2" judul="Bagaimana kredensial Monev dilindungi">
        <p>
          Kata sandi Monev harus bisa dipakai ulang untuk login ke portal
          Kemnaker, sehingga tidak bisa di-hash seperti kata sandi akun
          aplikasi. Karena itu kredensial disimpan dengan enkripsi dua arah
          AES-256-GCM, dengan nilai acak (IV) yang berbeda untuk setiap data.
        </p>
        <p>
          Perlu Anda ketahui secara jujur: karena enkripsi ini bersifat dua
          arah, pengelola yang memiliki kunci enkripsi secara teknis mampu
          membuka kredensial tersebut. Kunci tidak pernah ditulis di dalam kode
          atau log, tetapi Anda tetap sebaiknya tidak memakai kata sandi yang
          juga dipakai di layanan lain.
        </p>
      </Section>

      <Section nomor="3" judul="Apa yang tidak kami lakukan">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Kami tidak menjual atau menyewakan data Anda kepada pihak ketiga.
          </li>
          <li>
            Kami tidak memakai layanan analitik maupun iklan pelacak di halaman
            publik aplikasi ini.
          </li>
          <li>
            Kami tidak menulis kata sandi ke dalam log, pesan galat, atau
            respons API.
          </li>
        </ul>
      </Section>

      <Section nomor="4" judul="Penyimpanan dan penghapusan">
        <p>
          Data disimpan selama akun Anda aktif. Anda dapat menghapus draf
          laporan dan memutus koneksi kredensial Monev dari dashboard kapan
          saja. Untuk menghapus seluruh akun beserta datanya, hubungi pengelola
          melalui kontak di bagian 6.
        </p>
      </Section>

      <Section nomor="5" judul="Perubahan kebijakan">
        <p>
          Bila kebijakan ini berubah, tanggal &quot;Terakhir diperbarui&quot; di
          atas akan ikut berubah. Perubahan besar akan ditandai dengan jelas di
          aplikasi.
        </p>
      </Section>

      <Section nomor="6" judul="Hubungi kami">
        <ContactBlock />
      </Section>
    </LegalPage>
  );
}
