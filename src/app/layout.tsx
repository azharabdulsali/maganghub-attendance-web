import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Providers from "./providers";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Skrip anti-flicker (R-21). Dijalankan SEBELUM paint pertama supaya pengguna
// tema gelap tidak melihat kedipan putih. Isinya sengaja sekecil mungkin dan
// tidak bergantung pada React: baca localStorage, kalau tidak ada ikuti
// preferensi sistem. Skrip ini SUMBER KEBENARAN nilai awal; komponen
// ThemeToggle hanya menyinkronkan setelahnya (lihat src/components/theme-toggle.tsx).
//
// Dimuat lewat <Script strategy="beforeInteractive"> (next/script), BUKAN
// <script> telanjang: React 19 menolak elemen <script> mentah di pohon komponen
// ("Encountered a script tag while rendering React component" — skrip seperti
// itu tidak pernah dieksekusi saat render klien). `beforeInteractive` membuat
// Next menyuntikkan skrip ini ke HTML awal, jadi tetap berjalan sebelum paint
// dan menghilangkan kedipan. `id` wajib agar Next dapat mendeduplikasi skrip.
const skripTema = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Maganghub Autoabsen",
  description:
    "Kirim absensi MagangHub dari tiga template laporan Anda, otomatis dan tanpa biaya bulanan.",
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
        <Script id="tema-anti-flicker" strategy="beforeInteractive">
          {skripTema}
        </Script>
      </head>
      <body className="bg-secondary-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}