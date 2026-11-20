// src/app/(app)/repos/page.tsx: halaman pengaturan repo git (bahan draf laporan).
//
// Server component: memeriksa sesi & mengambil status awal, lalu menyerahkan
// tampilan ke form (client component). **Token tidak pernah sampai ke halaman
// ini**, hanya Boolean `hasToken`, sama seperti kredensial Monev.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gitCommitsEnabled } from "@/lib/git-repo-service";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title="Repo Git"
        badge={<Badge tone="neutral">Opsional</Badge>}
        description="Bahan draf tambahan dari commit di GitHub atau GitLab. Aplikasi tetap berfungsi penuh tanpa halaman ini."
      />

      {/* Penjelasan ini ada karena mayoritas peserta magang bukan programmer dan
          tidak memakai git. Tanpa kalimat "tidak perlu", menu ini terbaca seperti
          langkah persiapan yang wajib dan orang berhenti di instruksi token. */}
      <Card size="sm" className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Perlu halaman ini atau tidak?</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="space-y-1">
            <p className="font-heading">Perlu, bila…</p>
            <p className="text-muted-foreground">
              Pekerjaan magang Anda berupa kode yang disimpan di GitHub atau
              GitLab, dan perubahannya Anda simpan hampir setiap hari. Commit
              hari itu bisa jadi bahan draf, jadi Anda tidak perlu mengetik
              ulang.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-heading">Tidak perlu, bila…</p>
            <p className="text-muted-foreground">
              Anda tidak punya akun GitHub atau GitLab, atau pekerjaan Anda tidak
              disimpan sebagai commit (misalnya dokumen, spreadsheet, desain,
              atau kerja lapangan). Lewati saja halaman ini; template laporan dan
              tombol Susun draf tetap bekerja seperti biasa.
            </p>
          </div>
        </CardContent>
      </Card>

      <RepoForm
        featureEnabled={gitCommitsEnabled()}
        hasExisting={Boolean(repo)}
        existingProvider={repo?.provider ?? null}
        existingRepoPath={repo?.repoPath ?? null}
        existingBranch={repo?.branch ?? null}
        hasToken={Boolean(repo?.ciphertext)}
        initialEnabled={repo?.enabled ?? false}
        lastFetchedAt={repo?.lastFetchedAt?.toISOString() ?? null}
        lastError={repo?.lastError ?? null}
      />
    </div>
  );
}
