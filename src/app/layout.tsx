import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { cn } from "@/lib/utils";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Skrip anti-flicker (R-21). Dijalankan SEBELUM paint pertama supaya pengguna
// tema gelap tidak melihat kedipan putih. Isinya sengaja sekecil mungkin dan
// tidak bergantung pada React: baca localStorage, kalau tidak ada ikuti
// preferensi sistem. Skrip ini SUMBER KEBENARAN nilai awal; komponen
// ThemeToggle hanya menyinkronkan setelahnya (lihat src/components/theme-toggle.tsx).
//
// Isinya kini ada di public/tema.js dan dimuat lewat <script src="/tema.js">
// SINKRON di <head> (lihat RootLayout di bawah). Kenapa bukan <Script> dari
// next/script dan bukan <script> inline:
//   1. Harus BLOCKING, jalan sebelum paint pertama. DIUJI empiris pada Next
//      16.3.6/Turbopack: `<Script strategy="beforeInteractive">` TIDAK
//      menghasilkan inline blocking script di HTML server — ia hanya jadi
//      payload `self.__next_f.push` yang dieksekusi React setelah hidrasi,
//      sehingga tema gelap BERKEDIP putih lebih dulu.
//   2. <script> INLINE (dangerouslySetInnerHTML) memang tertanam di <head> HTML
//      awal dan blocking, TAPI React 19 melempar error "Encountered a script tag
//      while rendering React component" saat hydration karena root layout ikut
//      di-hydrate di klien.
//   3. Jalan tengah: file statis + <script src> sinkron. Tetap blocking &
//      pra-paint, tapi tag-nya kosong (tanpa konten inline) sehingga React tidak
//      memunculkan error. Perilakunya identik dengan inline, tanpa polusi konsol.
// Jangan "kembalikan" ke inline/next/script tanpa menguji ulang HTML hasil build
// (cari `tema.js` di <head>, bukan payload `self.__next_f.push`).

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
    <html
      lang="id"
      className={cn("font-sans", inter.variable)}
      suppressHydrationWarning
    >
      <head>
        {/* Skrip anti-flicker pra-paint (lihat catatan `skripTema` di atas).
            Dimuat sebagai file statis `/tema.js` dengan <script src> SINKRON
            (tanpa async/defer) supaya tetap memblokir parse & paint pertama —
            inilah yang mencegah kedipan putih pada tema gelap. Dipakai src
            (bukan isi inline) agar React 19 tidak memunculkan peringatan
            "Encountered a script tag while rendering React component"; React
            hanya protes untuk <script> berisi konten inline, bukan tag kosong
            ber-src. Isi file itu sendiri ada di public/tema.js. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- skrip ini
            MEMANG harus sinkron: ia harus jalan sebelum paint pertama untuk
            mencegah kedipan putih (lihat catatan `skripTema` di atas). Ukurannya
            ~200 byte dan dilayani lokal dari /public, jadi tidak ada risiko
            "render-blocking third-party script" yang jadi alasan aturan ini. */}
        <script src="/tema.js" />
      </head>
      <body className="bg-secondary-background text-foreground antialiased">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
