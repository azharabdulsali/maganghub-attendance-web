import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { cn } from "@/lib/utils";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Font JUDUL, sengaja berbeda dari font isi. Inter dipakai untuk semua teks
// panjang (nyaman dibaca), sedangkan Bricolage Grotesque memberi "suara" pada
// judul: bentuk hurufnya sedikit tidak simetris, seperti huruf pada buku absen
// cetak, bukan font bawaan generator UI. Hanya dipakai lewat `font-heading`,
// jadi tidak menyentuh keterbacaan paragraf.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

// Mono HANYA untuk string mesin: URL webhook, kunci, token, potongan kode.
// Sebelumnya `--font-mono` menunjuk `--font-geist-mono` yang tidak pernah
// dimuat, jadi setiap kelas `font-mono` diam-diam jatuh ke Inter. Sekarang
// keluarganya benar-benar ada, dan batas pemakaiannya ditulis di DESIGN.md.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

// Tema (R-21). TIDAK ada <script> anti-flicker lagi; keputusan ini hasil
// pengukuran, bukan selera:
//   1. <script src> / inline di pohon React memicu error React 19
//      "Encountered a script tag while rendering React component" saat root
//      layout dirender di klien (termasuk saat HMR).
//   2. <Script strategy="beforeInteractive"> lolos dari error itu, TAPI diukur
//      lewat Chrome DevTools Protocol pada Next 16.3.6: skrip dieksekusi SETELAH
//      paint pertama (333 ms, FCP 328 ms) sehingga tema gelap tetap berkedip.
//      Ia juga memunculkan error + mismatch hidrasi.
//   3. useServerInsertedHTML menyisipkan tag hanya di server, tapi React
//      melaporkan "Hydration failed" karena jumlah node tidak cocok.
//
// Penggantinya nol JavaScript: pilihan pengguna disimpan di cookie `tema`
// ("light"/"dark"), dibaca di sini saat render server, lalu dipasang sebagai
// kelas di <html>. `globals.css` menulis kedua palet berdampingan lewat
// light-dark(), jadi browser sudah memakai warna yang benar pada paint pertama.
// Tanpa cookie (kunjungan pertama) tidak ada kelas, dan `color-scheme: light dark`
// membuat tema mengikuti preferensi OS, juga tanpa kedipan.
//
// Konsekuensi yang disengaja: membaca cookie membuat rute dirender dinamis
// (tidak lagi statis). Itu harga yang diterima demi menghapus kedipan tanpa JS
// pra-paint; hampir semua halaman aplikasi ini butuh sesi server juga.

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
// semua padding safe-area di globals.css bernilai 0 dan tidak berefek
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Cookie `tema` ditulis ThemeToggle (lihat src/components/theme-toggle.tsx).
  // Kosong/asing = belum memilih -> tanpa kelas, tema mengikuti OS lewat CSS.
  const tema = (await cookies()).get("tema")?.value;

  return (
    <html
      lang="id"
      className={cn(
        "font-sans",
        inter.variable,
        display.variable,
        mono.variable,
        tema === "dark" && "dark",
        tema === "light" && "light",
      )}
      suppressHydrationWarning
    >
      <body className="bg-secondary-background text-foreground antialiased">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
