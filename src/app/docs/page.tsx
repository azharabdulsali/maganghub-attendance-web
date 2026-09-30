import type { Metadata } from "next";
import DocsContent from "./docs-content";
import { SITE_NAME } from "@/lib/site";

// Dokumentasi PUBLIK di "/docs", halaman statis berisi panduan penggunaan.
// Seluruh isinya mengacu pada fitur nyata proyek (kredensial terenkripsi, tiga
// template, submit REST API, jadwal cron, riwayat). TIDAK ada bagian AI,
// GitHub, atau tautan ke route yang belum ada.
export const metadata: Metadata = {
  title: "Dokumentasi",
  description:
    "Panduan penggunaan bot absensi & laporan MagangHub Kemnaker: kredensial Monev, template laporan, jadwal otomatis, dan keamanan.",
  alternates: { canonical: "/docs" },
  openGraph: {
    type: "article",
    locale: "id_ID",
    siteName: SITE_NAME,
    title: `Dokumentasi & Panduan | ${SITE_NAME}`,
    description:
      "Panduan penggunaan bot absensi & laporan MagangHub Kemnaker: kredensial Monev, template laporan, jadwal otomatis, dan keamanan.",
    url: "/docs",
  },
};

export default function DocsPage() {
  return <DocsContent />;
}
