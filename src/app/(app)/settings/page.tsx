// src/app/(app)/settings/page.tsx: halaman pengaturan akun.
//
// Dipisah dari /profile supaya ada batas yang jelas:
//   - /profile  → INFORMASI akun (baca saja: email, peran, status Monev).
//   - /settings → TINDAKAN yang mengubah akun (email, nama, kata sandi, sesi).
//
// Server component: sesi + data yang boleh ditampilkan. Tetap tidak ada rahasia
// (hash kata sandi maupun isi token Monev) yang dikirim ke klien (AGENTS.md §2).

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPassword } from "@/lib/auth-accounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Message } from "@/components/ui/message";
import ProfileForm from "./profile-form";
import PasswordForm from "./password-form";
import RevokeSessionsButton from "./revoke-sessions-button";
import EmailForm from "./email-form";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, passwordHash: true },
  });

  if (!user) {
    redirect("/login");
  }

  const punyaSandi = hasPassword(user);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="font-heading text-3xl">Pengaturan</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Ubah identitas dan keamanan akun aplikasi ini. Kredensial portal Monev
          diatur terpisah.
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-foreground/70">
            Email ini dipakai untuk masuk. Saat ini:{" "}
            <span className="font-heading">{user.email}</span>
          </p>
          {punyaSandi ? (
            <EmailForm currentEmail={user.email} />
          ) : (
            <Message tone="neutral">
              Akun ini masuk lewat Google dan belum punya kata sandi. Buat kata
              sandi dulu di kartu Kata sandi, lalu email bisa diubah di sini.
            </Message>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Nama tampilan</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm initialName={user.name ?? ""} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Kata sandi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-foreground/70">
            {punyaSandi
              ? "Ubah kata sandi akun ini. Anda perlu memasukkan kata sandi saat ini untuk mengonfirmasi. Mengubah kata sandi mengeluarkan Anda dari perangkat lain; perangkat ini tetap aktif."
              : "Akun ini masuk lewat Google dan belum punya kata sandi. Buat kata sandi di sini supaya akun juga bisa masuk tanpa Google."}
          </p>
          <PasswordForm hasPassword={punyaSandi} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Perangkat lain</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-foreground/70">
            Keluarkan semua sesi di perangkat lain tanpa mengubah kata sandi.
            Berguna bila Anda lupa keluar di komputer bersama atau perangkat
            yang hilang. Perangkat ini tetap aktif.
          </p>
          <RevokeSessionsButton />
        </CardContent>
      </Card>
    </div>
  );
}