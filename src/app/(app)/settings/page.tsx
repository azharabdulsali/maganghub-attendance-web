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
import { PageHeader } from "@/components/page-header";
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
      <PageHeader title="Pengaturan" description="Kelola akun dan keamanan." />

      <section className="mb-8">
        <h2 className="mb-3 font-heading text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
          Akun
        </h2>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Email</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Email saat ini:{" "}
              <span className="break-all font-heading">{user.email}</span>
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

        <Card>
          <CardHeader>
            <CardTitle>Nama tampilan</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm initialName={user.name ?? ""} />
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
          Keamanan
        </h2>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Kata sandi</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              {punyaSandi
                ? "Ubah kata sandi. Perangkat lain akan keluar otomatis."
                : "Buat kata sandi agar akun bisa masuk tanpa Google."}
            </p>
            <PasswordForm hasPassword={punyaSandi} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Perangkat lain</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Keluarkan semua sesi di perangkat lain. Perangkat ini tetap aktif.
            </p>
            <RevokeSessionsButton />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}