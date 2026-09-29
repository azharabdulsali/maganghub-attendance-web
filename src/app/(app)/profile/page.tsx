// src/app/(app)/profile/page.tsx — halaman profil pengguna.
//
// Server component: sesi + data yang boleh ditampilkan. Yang sengaja TIDAK
// ditampilkan: password (walau ter-hash) dan isi token Monev. Status kredensial
// hanya berupa label status, bukan rahasianya (AGENTS.md §2).

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProfileForm from "./profile-form";

// Label status kredensial dalam bahasa manusia + warna sorot.
const STATUS_LABEL: Record<string, { teks: string; penting: boolean }> = {
  ACTIVE: { teks: "Aktif — siap mengirim", penting: false },
  UNVERIFIED: { teks: "Belum diverifikasi", penting: false },
  INVALID: { teks: "Tidak valid — perlu login ulang di portal", penting: true },
};

function formatTanggal(d: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      createdAt: true,
      credential: {
        select: { status: true, emailMonev: true, updatedAt: true },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const status = user.credential
    ? STATUS_LABEL[user.credential.status] ?? {
        teks: user.credential.status,
        penting: false,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="font-heading text-3xl">Profil</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Informasi akun aplikasi ini. Kredensial portal Monev diatur terpisah.
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Data akun</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-heading uppercase tracking-wide text-foreground/60">
              Email (tidak bisa diubah)
            </span>
            <span className="text-sm">{user.email}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-heading uppercase tracking-wide text-foreground/60">
              Peran
            </span>
            <span
              className={`inline-flex w-fit items-center rounded-base border-2 border-border px-3 py-1 text-xs font-heading ${
                user.role === "ADMIN"
                  ? "bg-main text-main-foreground"
                  : "bg-secondary-background text-foreground"
              }`}
            >
              {user.role}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-heading uppercase tracking-wide text-foreground/60">
              Bergabung sejak
            </span>
            <span className="text-sm">{formatTanggal(user.createdAt)}</span>
          </div>

          <ProfileForm initialName={user.name ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Akun Monev</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {!user.credential ? (
            <p className="text-foreground/70">
              Belum ada kredensial Monev tersimpan. Buka halaman{" "}
              <a
                className="font-heading underline"
                href="/credentials"
              >
                Kredensial Monev
              </a>{" "}
              untuk menautkan akun portal Anda.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-heading uppercase tracking-wide text-foreground/60">
                  Email Monev
                </span>
                <span>{user.credential.emailMonev}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-heading uppercase tracking-wide text-foreground/60">
                  Status
                </span>
                <span
                  className={
                    status?.penting
                      ? "font-heading text-destructive"
                      : "font-heading"
                  }
                >
                  {status?.teks}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-heading uppercase tracking-wide text-foreground/60">
                  Terakhir diperbarui
                </span>
                <span>{formatTanggal(user.credential.updatedAt)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
