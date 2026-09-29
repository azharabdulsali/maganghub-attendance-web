import { redirect } from "next/navigation";
import Link from "next/link";
import { CircleCheck, Square } from "lucide-react";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import SubmitReportButton from "./submit-report-button";
import StatsCards from "./stats-cards";
import TrendChart from "./trend-chart";
import { getDashboardStats } from "./stats-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Dashboard — halaman utama setelah login, di URL /dashboard.
// Pemeriksaan sesi juga dilakukan di layout (app)/dashboard, tapi kita ulangi
// di sini supaya halaman ini tetap benar walau suatu saat dipindah. Lihat
// SPEC.md §5.8.
export default async function DashboardPage() {
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

  // Status kredensial nyata — supaya kartu ini jujur saat sesi Monev mati,
  // bukan selalu menyuruh "Atur kredensial" walau semuanya sehat.
  const credential = await prisma.maganghubCredential.findUnique({
    where: { userId },
    select: { status: true, tokenCiphertext: true, emailMonev: true },
  });
  const punyaToken = Boolean(credential?.tokenCiphertext);
  const perluPerhatian = credential?.status === "INVALID";

  // Statistik ringkas — dihitung di server, hanya membaca data milik pengguna.
  const { stats, trend } = await getDashboardStats(userId);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8">
        <h1 className="font-heading text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Masuk sebagai {session.user.email}
        </p>
      </div>

      <StatsCards stats={stats} />
      <TrendChart trend={trend} />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-foreground/70">Peran akun:</span>
          <Badge tone={isAdmin ? "good" : "neutral"}>{role}</Badge>
          {!env.ADMIN_EMAIL && (
            <p className="w-full text-xs text-foreground/60">
              Catatan: <code>ADMIN_EMAIL</code> belum diisi, jadi tidak ada admin
              yang dibuat otomatis.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className={`mb-6 ${perluPerhatian ? "border-2 border-destructive" : ""}`}>
        <CardHeader>
          <CardTitle>Kredensial Monev</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!credential ? (
            <p className="text-sm text-foreground/70">
              Belum ada kredensial. Simpan email &amp; password portal Maganghub
              untuk absensi otomatis. Password disimpan terenkripsi.
            </p>
          ) : perluPerhatian ? (
            <p className="text-sm text-foreground/80">
              <strong className="font-heading">Sesi Monev tidak valid.</strong>{" "}
              Login ulang di portal, lalu tempel token baru agar absensi otomatis
              bisa jalan lagi. Tersimpan: {credential.emailMonev}.
            </p>
          ) : punyaToken ? (
            <p className="text-sm text-foreground/70">
              Kredensial tersimpan untuk {credential.emailMonev}, token Monev sudah
              ada. Siap mengirim.
            </p>
          ) : (
            <p className="text-sm text-foreground/70">
              Kredensial tersimpan untuk {credential.emailMonev}, tetapi{" "}
              <strong className="font-heading">token Monev belum ada</strong> —
              pengiriman belum bisa jalan sampai token ditempel.
            </p>
          )}
          <Button
            variant={perluPerhatian ? "default" : "neutral"}
            render={<Link href="/dashboard/credentials" />}
          >
            {perluPerhatian
              ? "Perbarui token"
              : credential
                ? "Perbarui kredensial"
                : "Atur kredensial"}
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Kirim Absen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground/70">
            Kirim laporan untuk <strong>hari ini</strong> (zona Asia/Jakarta)
            memakai tiga template yang sudah diisi. Hari libur dan akhir program
            otomatis dilewati.
          </p>
          <SubmitReportButton />
        </CardContent>
      </Card>

      <Card className="mb-6 border-dashed">
        <CardHeader>
          <CardTitle>Kesiapan akun</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-foreground/70">
            <ReadinessItem ok={Boolean(credential)}>
              Kredensial Monev tersimpan
            </ReadinessItem>
            <ReadinessItem ok={punyaToken}>Token sesi Monev aktif</ReadinessItem>
            <ReadinessItem ok={punyaToken && !perluPerhatian}>
              Siap mengirim absensi harian
            </ReadinessItem>
          </ul>
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
          ok ? "text-emerald-600" : "text-foreground/40",
        )}
        aria-hidden
      />
      <span className={ok ? "text-foreground" : "text-foreground/60"}>
        {children}
      </span>
    </li>
  );
}
