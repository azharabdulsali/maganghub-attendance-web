// src/app/(app)/loading.tsx: kerangka muat (skeleton) saat pindah halaman.
//
// Kenapa ada: halaman di grup ini adalah Server Component yang menunggu
// beberapa query Prisma berurutan (statistik, log, kredensial). Sebelum ada
// `loading.tsx`, Next.js menahan halaman LAMA di layar tanpa tanda apa pun
// sampai data siap — pengguna menekan menu, tidak terjadi apa-apa, lalu
// menekan lagi. Itu terasa seperti aplikasi macet.
//
// Berkas ini dipasang di LEVEL GRUP, jadi satu perbaikan berlaku untuk semua
// halaman setelah login (dashboard, riwayat, kalender, …) tanpa menyalin
// skeleton ke tiap halaman.
//
// Aturan yang dipegang:
//   - `aria-busy` + `role="status"` agar pembaca layar mengumumkan "memuat",
//     bukan diam saja.
//   - Teks "Memuat…" yang TERLIHAT, bukan hanya animasi. Kerangka kelap-kelip
//     tanpa teks tidak bisa dipahami pengguna yang tidak melihat animasi
//     (WCAG 1.3.1 / 4.1.3).
//   - `motion-safe:animate-pulse`, sehingga pengguna yang meminta gerakan
//     dikurangi (`prefers-reduced-motion`) mendapat kotak diam (WCAG 2.3.3).
//   - TIDAK memakai `min-h-dvh`: sidebar sudah menempati sebagian layar.

export default function AppLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto w-full max-w-5xl px-4 py-10"
    >
      <span className="sr-only">Memuat halaman…</span>

      {/* Judul halaman */}
      <div className="mb-2 h-8 w-56 rounded-base bg-foreground/10 motion-safe:animate-pulse" />
      <div className="mb-8 h-4 w-80 max-w-full rounded-base bg-foreground/10 motion-safe:animate-pulse" />

      {/* Kartu statistik: 1 kolom di ponsel, 3 di layar lebar */}
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 rounded-base border-2 border-border bg-secondary-background motion-safe:animate-pulse"
          />
        ))}
      </div>

      {/* Blok isi utama */}
      <div className="h-64 rounded-base border-2 border-border bg-secondary-background motion-safe:animate-pulse" />

      {/* Teks cadangan untuk peramban tanpa dukungan animasi sama sekali:
          kerangka tetap terlihat sebagai kotak abu-abu, dan teks ini yang
          memberi tahu apa yang sedang terjadi. */}
      <p className="mt-4 text-sm text-foreground/70" aria-hidden="true">
        Memuat data…
      </p>
    </div>
  );
}
