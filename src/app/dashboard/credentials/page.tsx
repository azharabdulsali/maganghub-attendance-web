// src/app/dashboard/credentials/page.tsx — halaman simpan kredensial Monev.
//
// Server component: memeriksa sesi & mengambil status awal dari database,
// lalu menyerahkan tampilan ke form (client component). Password TIDAK
// pernah dikirim ke halaman ini — hanya status "sudah/belum ada".

import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CredentialsForm from "./credentials-form";

export default async function CredentialsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const credential = await prisma.maganghubCredential.findUnique({
    where: { userId: session.user.id },
    select: { emailMonev: true, status: true, updatedAt: true },
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm font-heading underline underline-offset-4"
        >
          ← Kembali ke dashboard
        </Link>
        <h1 className="mt-4 font-heading text-3xl">Kredensial Monev</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Dipakai untuk login ke portal Maganghub saat mengirim laporan absensi.
        </p>
      </div>

      <CredentialsForm
        hasExisting={Boolean(credential)}
        existingEmail={credential?.emailMonev ?? null}
        existingStatus={credential?.status ?? null}
        updatedAt={credential?.updatedAt?.toISOString() ?? null}
      />
    </main>
  );
}
