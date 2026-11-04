// src/app/(app)/repos/page.tsx: halaman pengaturan repo git (bahan draf laporan).
//
// Server component: memeriksa sesi & mengambil status awal, lalu menyerahkan
// tampilan ke form (client component). **Token tidak pernah sampai ke halaman
// ini**, hanya Boolean `hasToken` — sama seperti kredensial Monev.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gitCommitsEnabled } from "@/lib/git-repo-service";
import RepoForm from "./repo-form";

export default async function ReposPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const repo = await prisma.gitRepoConfig.findUnique({
    where: { userId: session.user.id },
    // `ciphertext` hanya dibaca untuk dihitung jadi Boolean, tidak dikirim.
    select: {
      provider: true,
      repoPath: true,
      branch: true,
      enabled: true,
      ciphertext: true,
      lastFetchedAt: true,
      lastError: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl">Repo Git</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Hubungkan <strong>satu</strong> repo GitHub atau GitLab agar commit
          hari itu bisa dipakai sebagai bahan draf laporan. Fitur ini{" "}
          <strong>mati secara bawaan</strong>; tidak ada yang diambil sebelum
          Anda mengisi repo di sini.
        </p>
      </div>

      <RepoForm
        featureEnabled={gitCommitsEnabled()}
        hasExisting={Boolean(repo)}
        existingProvider={repo?.provider ?? null}
        existingRepoPath={repo?.repoPath ?? null}
        existingBranch={repo?.branch ?? null}
        hasToken={Boolean(repo?.ciphertext)}
        lastFetchedAt={repo?.lastFetchedAt?.toISOString() ?? null}
        lastError={repo?.lastError ?? null}
      />
    </div>
  );
}
