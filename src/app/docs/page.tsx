import type { Metadata } from "next";
import DocsContent from "./docs-content";

// Dokumentasi PUBLIK di "/docs", halaman statis berisi panduan penggunaan.
// Seluruh isinya mengacu pada fitur nyata proyek (kredensial terenkripsi, tiga
// template, submit REST API, jadwal cron, riwayat). TIDAK ada bagian AI,
// GitHub, atau tautan ke route yang belum ada.
export const metadata: Metadata = {
  title: "Dokumentasi, MagangHub Absensi",
  description:
    "Panduan penggunaan bot absensi & laporan MagangHub Kemnaker: kredensial Monev, template laporan, jadwal otomatis, dan keamanan.",
};

export default function DocsPage() {
  return <DocsContent />;
}
