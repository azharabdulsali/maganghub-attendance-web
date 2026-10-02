import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  FileCheck,
  KeyRound,
  Square,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { refreshTokenHealth } from "@/lib/credential-session";
import { checkReportField } from "@/lib/report-rules";
import { cn } from "@/lib/utils";
import {
  parseRangeFilter,
  RANGE_FILTER_LABELS,
  RANGE_FILTERS,
} from "@/lib/audit-log";
import SubmitReportButton from "./submit-report-button";
import StatsCards from "./stats-cards";
import TrendChart from "./trend-chart";
import FilterBar from "@/components/filter-bar";
import { getDashboardStats, todayJakartaISODate } from "./stats-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Message } from "@/components/ui/message";

// Dashboard, halaman utama setelah login, di URL /dashboard.
// Pemeriksaan sesi juga dilakukan di layout (app)/dashboard, tapi kita ulangi
// di sini supaya halaman ini tetap benar walau suatu saat dipindah. Lihat
// SPEC.md §5.8.
type DashboardPageProps = {
  // Di Next.js 16, `searchParams` adalah Promise yang harus di-await.
  searchParams: Promise<{ range?: string }>;
};
export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Sempitkan sekali di sini: tipe NextAuth mengizinkan `id` undefined,
  // sedangkan semua query di bawah wajib punya userId yang pasti.
  const userId = session.user.id;
  if (!userId) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role ?? "USER";
  const isAdmin = role === "ADMIN";

  const params = await searchParams;
  const range = parseRangeFilter(params.range);

  // Satu `now` dipakai ulang untuk panel "Status Hari Ini" supaya batas harinya
  // tidak bisa berbeda dengan hari-hari di grafik (lihat stats-query.ts).
  const now = new Date();

  // Kedua query ini hanya butuh `userId` dan tidak saling bergantung, jadi
  // dijalankan PARALEL. Kalau di-await berurutan, dua round-trip database
  // bertumpuk (waterfall), padahal tidak ada alasan untuk menunggu salah satu.
  //
  // Status kredensial nyata, supaya kartu di bawah jujur saat sesi Monev mati,
  // bukan selalu menyuruh "Atur kredensial" walau semuanya sehat.
  // Statistik ringkas, dihitung di server, hanya membaca data milik pengguna.
  const [credential, { stats, trend, chartDays }, tokenHealth, template] =
    await Promise.all([
      prisma.maganghubCredential.findUnique({
        where: { userId },
        select: { status: true, tokenCiphertext: true, emailMonev: true },
      }),
      getDashboardStats(userId, range, now),
      refreshTokenHealth(userId),
      // Template harian dipakai untuk menilai kesiapan "3 laporan". Hanya kolom
      // yang dibutuhkan yang diambil; aturan panjangnya menyusul di bawah.
      prisma.reportTemplate.findUnique({
        where: { userId },
        select: { activity: true, learning: true, obstacles: true },
      }),
    ]);

  const punyaToken = Boolean(credential?.tokenCiphertext);
  const perluPerhatian = credential?.status === "INVALID";

  // "3 laporan sudah disimpan" = ketiga template tetap (Uraian Aktivitas,
  // Pembelajaran, Kendala) sudah terisi DAN memenuhi panjang minimal portal.
  // Memakai `checkReportField` (sumber kebenaran yang sama dengan jalur kirim)
  // supaya item ini tidak pernah hijau untuk isi yang sebenarnya ditolak portal.
  // Lihat src/lib/report-rules.ts & SPEC.md §5.3.
  const templateLengkap = Boolean(
    template &&
      checkReportField(template.activity) === null &&
      checkReportField(template.learning) === null &&
      checkReportField(template.obstacles) === null,
  );

  // Status template default untuk panel "Status Hari Ini". Dibedakan tiga
  // keadaan supaya pesannya jujur, bukan sekadar "belum lengkap":
  //   - belumAdaTemplate: belum pernah disimpan sama sekali.
  //   - templateLengkap: ketiga kolom terisi & lolos syarat panjang portal.
  //   - sisanya: sudah ada isinya, tapi masih ada kolom yang kurang/terlalu pendek.
  const belumAdaTemplate = !template;
  const templateKurang = !templateLengkap; // mencakup belumAdaTemplate
  const labelTemplate = belumAdaTemplate
    ? "Template default belum diisi"
    : templateLengkap
      ? "Template default siap"
      : "Template default belum lengkap";

  // Tanggal hari ini di zona Asia/Jakarta (YYYY-MM-DD), dipakai panel
  // "Status Hari Ini". Memakai helper yang sama dengan penghitung tren supaya
  // batas harinya konsisten (bukan tanggal jam perangkat pengguna).
  const hariIni = todayJakartaISODate(now);

  // Apakah hari ini sudah ada pengiriman sukses? Setiap rentang (7d/30d/90d/
  // 1y/Semua) selalu memuat hari ini, jadi tren apa pun cukup untuk menjawab.
  const sudahKirimHariIni = trend.some(
    (p) => p.date === hariIni && p.success > 0,
  );

  // Dua kondisi yang membuat absensi belum bisa jalan. Dipisah supaya pesannya
  // spesifik: "belum diatur" vs "sudah ada tapi token mati".
  const belumAdaKredensial = !credential;
  const adaMasalah = belumAdaKredensial || perluPerhatian || !punyaToken;

  // Pengingat dini: sesi masih sehat, tapi refresh token akan kedaluwarsa dalam
  // <= 7 hari. Hanya ditampilkan saat TIDAK ada masalah lain (kalau sesi sudah
  // INVALID, banner merah di atas sudah lebih mendesak & memberi langkah sama).
  const perluIngatkanRefresh =
    !adaMasalah && tokenHealth.nearingExpiry && tokenHealth.daysLeft !== null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading text-2xl sm:text-3xl">
          Ringkasan &amp; Dashboard
        </h1>
        <p className="mt-1 text-sm text-foreground/70">
          Pantau status absensi harian dan kirim laporan ke portal Monev dari
          satu tempat.
        </p>
      </div>

      {/* Banner peringatan, hanya muncul bila ada yang perlu dibereskan.
          Memakai Message tone="bad" (merah) supaya sejalan dengan bahasa nada
          proyek, bukan warna kuning baru. Aksi utama ada di dalam banner agar
          pengguna langsung tahu langkah berikutnya. */}
      {adaMasalah && (
        <Message tone="bad" as="div" className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-heading">
                  {belumAdaKredensial
                    ? "Kredensial Monev belum diatur"
                    : perluPerhatian
                      ? "Sesi Monev tidak valid"
                      : "Token Monev belum ada"}
                </p>
                <p className="mt-1 text-xs text-foreground/80">
                  {belumAdaKredensial
                    ? "Simpan email & password portal Maganghub untuk mengaktifkan absensi otomatis. Password disimpan terenkripsi."
                    : perluPerhatian
                      ? "Login ulang di portal, lalu tempel token baru agar absensi otomatis bisa jalan lagi."
                      : "Kredensial sudah tersimpan, tetapi token sesi belum ditempel, pengiriman belum bisa jalan."}
                </p>
              </div>
            </div>
            <Button className="shrink-0" render={<Link href="/credentials" />}>
              {perluPerhatian ? "Perbarui token" : "Atur kredensial"}
            </Button>
          </div>
        </Message>
      )}

      {/* Pengingat dini (bukan error): sesi sehat, tapi refresh token hampir
          habis. Nada `neutral` supaya tidak terlihat seperti kegagalan; beri
          tahu jumlah hari & langkah yang sama agar bisa disiapkan sebelum mati,
          bukan setelah absensi gagal. */}
      {perluIngatkanRefresh && (
        <Message tone="neutral" as="div" className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-heading">Sesi Monev segera berakhir</p>
                <p className="mt-1 text-xs text-foreground/80">
                  {`Sesi otomatis berakhir dalam ±${tokenHealth.daysLeft} hari. Login ulang di portal lalu tempel token baru sebelum itu supaya absensi otomatis tidak terhenti.`}
                </p>
              </div>
            </div>
            <Button className="shrink-0" render={<Link href="/credentials" />}>
              Perbarui sesi
            </Button>
          </div>
        </Message>
      )}

      {/* Filter rentang waktu untuk kartu statistik & grafik di bawah. <select>
          native di dalam <form method="get">; memilih rentang langsung
          menerapkan, dan URL-nya bisa di-bookmark. */}
      <div className="mb-4">
        <FilterBar
          fields={[
            {
              name: "range",
              label: "Rentang waktu",
              value: range,
              options: RANGE_FILTERS.map((r) => ({
                value: r,
                label: RANGE_FILTER_LABELS[r],
              })),
            },
          ]}
        />
      </div>

      <StatsCards stats={stats} />

      {/* Panel "Status Hari Ini", ringkasan satu baris yang menjawab
          pertanyaan utama pengguna: hari ini sudah kirim belum, dan apa yang
          menghalangi kalau belum. Menggabungkan status kirim + status
          kredensial yang tadinya terpisah di dua kartu. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Status Hari Ini</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-foreground/60">
              {hariIni}
            </span>
            <Badge tone={sudahKirimHariIni ? "good" : "neutral"}>
              {sudahKirimHariIni ? "Sudah dikirim" : "Belum dikirim"}
            </Badge>
            <Badge tone={adaMasalah ? "bad" : "good"}>
              <KeyRound className="mr-1 size-3" aria-hidden />
              {adaMasalah ? "Kredensial perlu diatur" : "Kredensial siap"}
            </Badge>
            <Badge tone={templateLengkap ? "good" : "neutral"}>
              <FileCheck className="mr-1 size-3" aria-hidden />
              {labelTemplate}
            </Badge>
          </div>
          <p className="text-sm text-foreground/70">
            {sudahKirimHariIni
              ? "Laporan hari ini sudah terkirim ke portal Monev."
              : adaMasalah
                ? "Laporan hari ini belum terkirim, dan masih ada yang perlu diatur sebelum bisa mengirim."
                : "Belum ada laporan terkirim hari ini. Kredensial siap, kamu bisa langsung mengirim di bawah."}
          </p>
          {templateKurang && (
            <p className="text-xs text-foreground/60">
              {belumAdaTemplate
                ? "Laporan default belum diisi, jadi tidak ada isi yang dikirim."
                : "Laporan default masih ada kolom yang kosong atau kurang dari 100 karakter."}{" "}
              <Link
                href="/report-templates"
                className="text-foreground underline underline-offset-4"
              >
                Isi template laporan
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <TrendChart trend={trend} range={range} chartDays={chartDays} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kirim Absen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground/70">
              Kirim laporan untuk <strong>hari ini</strong> (zona Asia/Jakarta)
              memakai tiga template yang sudah diisi. Hari libur dan akhir
              program otomatis dilewati.
            </p>
            <SubmitReportButton />
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Kesiapan akun</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-foreground/70">
              <ReadinessItem ok={Boolean(credential)}>
                Kredensial Monev tersimpan
              </ReadinessItem>
              <ReadinessItem ok={punyaToken}>
                Token sesi Monev aktif
              </ReadinessItem>
              <ReadinessItem ok={templateLengkap}>
                3 laporan sudah disimpan
              </ReadinessItem>
              <ReadinessItem ok={punyaToken && !perluPerhatian}>
                Siap mengirim absensi harian
              </ReadinessItem>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-foreground/70">Peran akun:</span>
          <Badge tone={isAdmin ? "good" : "neutral"}>
            <FileCheck className="mr-1 size-3" aria-hidden />
            {role}
          </Badge>
          <span className="w-full text-xs text-foreground/50">
            Masuk sebagai {session.user.email}
          </span>
          {!env.ADMIN_EMAIL && (
            <p className="w-full text-xs text-foreground/60">
              Catatan: <code>ADMIN_EMAIL</code> belum diisi, jadi tidak ada
              admin yang dibuat otomatis.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Satu baris daftar "Kesiapan akun".
 *
 * Ikon menggantikan emoji ✅/⬜: emoji dirender berbeda di tiap OS (Windows,
 * Android, iOS) dan tidak mewarisi warna teks, sehingga tampilannya tidak
 * konsisten dengan garis tebal neo-brutal yang dipakai sekitarnya. lucide
 * memberi ikon vektor yang warnanya ikut token tema.
 */
function ReadinessItem({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  const Icon = ok ? CircleCheck : Square;
  return (
    <li className="flex items-center gap-2">
      <Icon
        className={cn(
          "size-4 shrink-0",
          ok ? "text-success" : "text-foreground/40",
        )}
        aria-hidden
      />
      <span className={ok ? "text-foreground" : "text-foreground/60"}>
        {children}
      </span>
    </li>
  );
}
