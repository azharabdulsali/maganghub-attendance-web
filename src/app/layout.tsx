import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { cn } from "@/lib/utils";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Skrip anti-flicker (R-21). Dijalankan SEBELUM paint pertama supaya pengguna
// tema gelap tidak melihat kedipan putih. Isinya sengaja sekecil mungkin dan
// tidak bergantung pada React: baca localStorage, kalau tidak ada ikuti
// preferensi sistem. Skrip ini SUMBER KEBENARAN nilai awal; komponen
// ThemeToggle hanya menyinkronkan setelahnya (lihat src/components/theme-toggle.tsx).
//
// Dimuat sebagai <script> INLINE lewat dangerouslySetInnerHTML di dalam <head>,
// BUKAN <Script> dari next/script. Dua alasan:
//   1. React 19 menolak elemen <script> sebagai child komponen di render klien
//      ("Encountered a script tag while rendering React component").
//   2. Skrip ini harus BLOCKING dan jalan sebelum paint pertama. next/script
//      `beforeInteractive` tidak selalu menghasilkan inline blocking script
//      pada Next 16/Turbopack, sehingga tema bisa berkedip.
// dangerouslySetInnerHTML di sini AMAN: isinya string konstan yang kita tulis
// sendiri (bukan input pengguna), jadi tak ada risiko injeksi. Ini pola resmi
// Next.js untuk skrip blocking pra-paint.
const skripTema = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export const metadata: Metadata = {
  // metadataBase WAJIB: tanpa ini semua URL relatif di canonical, Open Graph,
  // dan Twitter card tidak bisa dijadikan absolut (audit T-3).
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    // Halaman anak otomatis mendapat "… | MagangHub".
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  // canonical dan og:url default ke beranda; halaman lain menimpanya.
  alternates: { canonical: "/" },
  keywords: [
    "absensi maganghub",
    "presensi magang kemnaker",
    "laporan monev magang",
    "otomatisasi absensi magang",
    "bot absen maganghub",
    "maganghub autoabsen",
  ],
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // Beranda publik boleh diindeks; rute terlindungi menimpanya (lihat (app)/layout.tsx).
  robots: { index: true, follow: true },
};

// Next.js menyuntikkan <meta name="viewport" content="width=device-width,
// initial-scale=1"> secara default, jadi zoom TIDAK pernah dimatikan. Ekspor ini
// membuat nilai itu eksplisit dan mengunci aturan ui-ux-pro-max `viewport-meta`
// supaya tidak ada yang tanpa sengaja menambahkan `maximum-scale` /
// `user-scalable=no` di kemudian hari (itu pelanggaran WCAG 1.4.4).
//
// `viewportFit: "cover"`: WAJIB agar `env(safe-area-inset-*)` melaporkan nilai
// NON-NOL di perangkat berponi (iPhone notch, home indicator). Tanpa ini,
// semua padding safe-area di globals.css bernilai 0 dan tidak berefek —
// konten tepi (header sticky, laci, toast, footer) bisa tertutup poni.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5294ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={cn("font-sans", inter.variable)} suppressHydrationWarning>
      <head>
        {/* Skrip anti-flicker inline pra-paint (lihat catatan `skripTema` di atas). */}
        <script id="tema-anti-flicker" dangerouslySetInnerHTML={{ __html: skripTema }} />
      </head>
      <body className="bg-secondary-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}