// src/app/(app)/credentials/page.tsx: halaman simpan kredensial Monev.
//
// Server component: memeriksa sesi & mengambil status awal dari database,
// lalu menyerahkan tampilan ke form (client component). Password TIDAK
// pernah dikirim ke halaman ini, hanya status "sudah/belum ada".

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import CredentialsForm from "./credentials-form";

export default async function CredentialsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const credential = await prisma.maganghubCredential.findUnique({
    where: { userId: session.user.id },
    select: {
      emailMonev: true,
      status: true,
      updatedAt: true,
      tokenCiphertext: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title="Kredensial Monev"
        description="Simpan kredensial portal Monev terenkripsi untuk absensi otomatis."
      />

      <CredentialsForm
        hasExisting={Boolean(credential)}
        existingEmail={credential?.emailMonev ?? null}
        existingStatus={credential?.status ?? null}
        updatedAt={credential?.updatedAt?.toISOString() ?? null}
        hasToken={Boolean(credential?.tokenCiphertext)}
      />
    </div>
  );
}
