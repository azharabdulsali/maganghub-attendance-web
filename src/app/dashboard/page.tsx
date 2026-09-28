import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import SignOutButton from "./sign-out-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Dashboard — halaman terlindungi. Kalau belum login, langsung dilempar
// ke /login. Ini bukti berhasil Tahap 1 (SPEC.md §12).
export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role ?? "USER";
  const isAdmin = role === "ADMIN";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Masuk sebagai {session.user.email}
          </p>
        </div>
        <SignOutButton />
      </div>

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-foreground/70">Peran akun:</span>
          <span
            className={`inline-flex items-center rounded-base border-2 border-border px-3 py-1 text-xs font-heading ${
              isAdmin
                ? "bg-main text-main-foreground"
                : "bg-secondary-background text-foreground"
            }`}
          >
            {role}
          </span>
          {!env.ADMIN_EMAIL && (
            <p className="w-full text-xs text-foreground/60">
              Catatan: <code>ADMIN_EMAIL</code> belum diisi, jadi tidak ada admin
              yang dibuat otomatis.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Kredensial Monev</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground/70">
            Simpan email &amp; password portal Maganghub untuk absensi otomatis.
            Password disimpan terenkripsi.
          </p>
          <Button render={<Link href="/dashboard/credentials" />}>
            Atur kredensial
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6 border-dashed">
        <CardHeader>
          <CardTitle>Template Laporan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground/70">
            Isi 3 template laporan yang dipakai berulang setiap hari absensi.
            Minimal 100 karakter per kolom.
          </p>
          <Button render={<Link href="/dashboard/report-templates" />}>
            Atur template
          </Button>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="mb-6 border-dashed">
          <CardHeader>
            <CardTitle>Alat Diagnostik (khusus admin)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground/70">
              Rekam bentuk endpoint submit laporan dari browser Anda sendiri
              (docs/MONEV-API.md §8). Tidak menyimpan atau mengirim apa pun.
            </p>
            <Button
              variant="neutral"
              render={<Link href="/dashboard/dev-tools" />}
            >
              Buka alat diagnostik
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6 border-dashed">
        <CardHeader>
          <CardTitle>Tahap 1 selesai — fondasi siap</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-foreground/70">
            Login, sesi, dan database sudah bekerja. Fitur absensi menyusul pada
            tahap berikutnya.
          </p>
          <ol className="space-y-1 text-sm text-foreground/70">
            <li>✅ Skema database tersinkron ke Neon</li>
            <li>✅ Tampilan neobrutalism (responsif tablet &amp; HP)</li>
            <li>✅ Simpan kredensial Monev (Tahap 2)</li>
            <li>⬜ Isi 3 template laporan (Tahap 2–3)</li>
            <li>⬜ Kirim absensi ke portal (Tahap 4)</li>
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}