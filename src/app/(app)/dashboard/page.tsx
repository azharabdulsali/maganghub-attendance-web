import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Circle,
  CircleAlert,
  CircleCheck,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokenHealth } from "@/lib/credential-session";
import { loadHolidaySet } from "@/lib/holidays-repo";
import { loadWorkSchedule } from "@/lib/work-schedule-repo";
import { checkReportField } from "@/lib/report-rules";
import { cn } from "@/lib/utils";
import {
  parseRangeFilter,
  RANGE_FILTER_LABELS,
  RANGE_FILTERS,
} from "@/lib/audit-log";
import SubmitReportButton from "./submit-report-button";
import StatsCards from "./stats-cards";
import StatusCalendar from "./status-calendar";
import FilterBar from "@/components/filter-bar";
import { getDashboardStats, todayJakartaISODate } from "./stats-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Message } from "@/components/ui/message";
import { PageHeader } from "@/components/page-header";
import { Stamp } from "@/components/ui/stamp";
import { Disclosure } from "@/components/ui/collapsible";

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
  const [credential, { stats, trend }, tokenHealth, template, holidays, workDays] =
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
      // Libur admin + jadwal kerja pengguna: kalender mini memberi garis
      // putus-putus pada "hari ini bukan hari kerja Anda" memakai aturan yang
      // SAMA dengan halaman /calendar & jalur kirim. Keduanya gagal-lunak
      // (libur → daftar statis, jadwal → Senin–Jumat).
      loadHolidaySet(),
      loadWorkSchedule(userId),
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

  // Status template default untuk kartu "Kesiapan akun". Dibedakan tiga
  // keadaan supaya pesannya jujur, bukan sekadar "belum lengkap":
  //   - belumAdaTemplate: belum pernah disimpan sama sekali.
  //   - templateLengkap: ketiga kolom terisi & lolos syarat panjang portal.
  //   - sisanya: sudah ada isinya, tapi masih ada kolom yang kurang/terlalu pendek.
  const belumAdaTemplate = !template;

  // Empat syarat "Kesiapan akun". Poin keempat adalah ringkasan: ia baru hijau
  // bila ketiga syarat sebelumnya terpenuhi, jadi tidak pernah hijau palsu.
  const kredensialSiap = Boolean(credential);
  const tokenSiap = punyaToken && !perluPerhatian;
  const siapKirim = kredensialSiap && tokenSiap && templateLengkap;
  const siapCount = [kredensialSiap, tokenSiap, templateLengkap, siapKirim].filter(
    Boolean,
  ).length;

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
      <PageHeader
        title="Dashboard"
        description="Ringkasan absensi dan kesiapan akun Anda."
      />

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
                <p className="mt-1 text-xs text-muted-foreground">
                  {belumAdaKredensial
                    ? "Simpan kredensial Monev untuk melanjutkan."
                    : perluPerhatian
                      ? "Token ditolak. Perbarui kredensial Anda."
                      : "Token sesi belum tersedia."}
                </p>
              </div>
            </div>
            <Button
              className="w-full shrink-0 sm:w-auto"
              render={<Link href="/credentials" />}
              title={perluPerhatian ? "Perbarui token" : "Atur kredensial"}
              aria-label={perluPerhatian ? "Perbarui token" : "Atur kredensial"}
            >
              {perluPerhatian ? (
                <RefreshCw aria-hidden />
              ) : (
                <KeyRound aria-hidden />
              )}
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
                <p className="mt-1 text-xs text-muted-foreground">
                  {`Sesi berakhir dalam ±${tokenHealth.daysLeft} hari. Perbarui sebelum habis.`}
                </p>
              </div>
            </div>
            <Button
              className="w-full shrink-0 sm:w-auto"
              render={<Link href="/credentials" />}
              title="Perbarui sesi Monev"
              aria-label="Perbarui sesi Monev"
            >
              <RefreshCw aria-hidden />
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

      {/* Panel "Status Hari Ini" digabung ke kartu aksi di bawah: keduanya
          menjawab satu pertanyaan yang sama, dan dulu pengguna harus membaca
          dua kartu untuk tahu "hari ini sudah kirim belum". Rincian SYARAT
          tetap di kartu "Kesiapan akun" supaya satu fakta hanya muncul sekali. */}

      {/* Kesiapan akun: 4 syarat sebelum absensi bisa dikirim. Kartu ini
          informatif (tidak bisa ditekan), jadi tanpa bayangan keras; bayangan
          disimpan untuk tombol dan kartu aksi. */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Kesiapan akun</CardTitle>
            <Badge tone={siapCount === 4 ? "good" : "neutral"}>
              {siapCount}/4 siap
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="h-2.5 w-full overflow-hidden rounded-base border-2 border-border bg-secondary-background"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={siapCount}
            aria-label={`Kesiapan akun: ${siapCount} dari 4 syarat terpenuhi`}
          >
            <div
              className="h-full bg-success transition-[width] duration-300"
              style={{ width: `${(siapCount / 4) * 100}%` }}
            />
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            <ReadinessItem
              ok={kredensialSiap}
              label="Kredensial Monev tersimpan"
              hint={kredensialSiap ? "Siap dipakai" : "Belum diisi"}
              href="/credentials"
              actionLabel="Atur"
            />
            <ReadinessItem
              ok={tokenSiap}
              label="Token sesi Monev aktif"
              hint={
                perluPerhatian
                  ? "Token ditolak, perlu diperbarui"
                  : punyaToken
                    ? "Aktif"
                    : "Belum ada token"
              }
              href="/credentials"
              actionLabel="Perbarui"
            />
            <ReadinessItem
              ok={templateLengkap}
              label="3 laporan sudah disimpan"
              hint={
                templateLengkap
                  ? "Ketiga kolom memenuhi syarat"
                  : belumAdaTemplate
                    ? "Template default belum diisi"
                    : "Ada kolom yang kurang dari 100 karakter"
              }
              href="/report-templates"
              actionLabel="Isi"
            />
            <ReadinessItem
              ok={siapKirim}
              label="Siap mengirim absensi harian"
              hint={
                siapKirim
                  ? "Semua syarat terpenuhi"
                  : "Lengkapi poin di atas"
              }
            />
          </ul>
        </CardContent>
      </Card>

      {/* Aksi utama halaman, sekaligus jawaban "hari ini sudah kirim belum".
          Ditaruh sebelum kalender: pengguna yang buru-buru tidak perlu
          menggulir melewati analitik untuk menemukan tombol kirim.

          Bentuknya sengaja BUKAN kartu biasa: cap status (Stamp) hanya dipakai
          untuk status pengiriman, dan di sinilah satu-satunya tempat yang
          benar-benar mengabarkannya. Tombol & pesan hasil ditaruh satu kolom
          penuh supaya pesan sukses/gagal tidak terjepit di kolom sempit. */}
      <section className="mb-6 border-2 border-border bg-secondary-background p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-heading text-2xl">Kirim absen hari ini</h2>
          <Stamp tone={sudahKirimHariIni ? "good" : "neutral"}>
            {sudahKirimHariIni ? "Terkirim" : "Belum terkirim"}
          </Stamp>
        </div>
        {/* Tanggal ditulis sebagai teks biasa, bukan `font-mono` berhuruf
            besar: isinya kalimat, bukan string mesin. */}
        <p className="mt-2 text-xs text-muted-foreground">{hariIni}</p>
        <p className="mt-1 text-sm">
          {sudahKirimHariIni
            ? "Laporan hari ini sudah terkirim."
            : siapKirim
              ? "Siap dikirim hari ini."
              : "Lengkapi kesiapan akun di atas sebelum mengirim."}
        </p>
        <div className="mt-4">
          <SubmitReportButton />
        </div>
        <div className="mt-4">
          <Disclosure summary="Kapan laporan tidak dikirim?">
            Hari di luar jadwal kerja Anda, hari libur nasional, dan tanggal
            setelah akhir program otomatis dilewati. Laporan hanya untuk hari
            ini (zona Asia/Jakarta).
          </Disclosure>
        </div>
      </section>

      <StatusCalendar
        trend={trend}
        range={range}
        workDays={workDays}
        holidays={holidays}
      />
    </div>
  );
}

/**
 * Satu poin "Kesiapan akun".
 *
 * Ikon menggantikan emoji ✅/⬜: emoji dirender berbeda di tiap OS dan tidak
 * mewarisi warna teks, sehingga tidak konsisten dengan garis tebal neo-brutal
 * di sekitarnya. Saat poin belum siap, baris diberi garis putus-putus + tautan
 * perbaikan langsung, supaya pengguna tidak perlu menebak ke mana harus pergi.
 */
function ReadinessItem({
  ok,
  label,
  hint,
  href,
  actionLabel,
}: {
  ok: boolean;
  label: string;
  hint?: string;
  href?: string;
  actionLabel?: string;
}) {
  const Icon = ok ? CircleCheck : Circle;
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-base border-2 p-3",
        ok
          ? "border-border bg-background"
          : "border-dashed border-border bg-secondary-background",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          ok ? "text-success" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm">{label}</p>
        {hint && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
      {!ok && href && actionLabel && (
        <Link
          href={href}
          className="shrink-0 text-xs font-heading underline underline-offset-4"
        >
          {actionLabel}
        </Link>
      )}
    </li>
  );
}

