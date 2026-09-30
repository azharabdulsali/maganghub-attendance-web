import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Skrip anti-flicker (R-21). Dijalankan SEBELUM paint pertama supaya pengguna
// tema gelap tidak melihat kedipan putih. Isinya sengaja sekecil mungkin dan
// tidak bergantung pada React: baca localStorage, kalau tidak ada ikuti
// preferensi sistem. Skrip ini SUMBER KEBENARAN nilai awal; komponen
// ThemeToggle hanya menyinkronkan setelahnya (lihat src/components/theme-toggle.tsx).
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
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
        <script dangerouslySetInnerHTML={{ __html: skripTema }} />
      </head>
      <body className="bg-secondary-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}