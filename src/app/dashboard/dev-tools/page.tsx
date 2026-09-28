// src/app/dashboard/dev-tools/page.tsx — alat diagnostik (khusus admin).
//
// Tujuan: membantu pemilik akun merekam SATU kali klik "Simpan dan Kirim" di
// browsernya sendiri, lalu menemukan bentuk endpoint submit (§8). Halaman ini
// tidak pernah mengirim apa pun ke portal Monev — ia hanya menganalisis teks
// rekaman yang ditempel.

import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import AnalyzeCaptureForm from "./analyze-capture-form";

export default async function DevToolsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role ?? "USER";
  if (role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm font-heading underline underline-offset-4"
        >
          ← Kembali ke dashboard
        </Link>
        <h1 className="mt-4 font-heading text-3xl">Alat Diagnostik</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Khusus admin. Untuk merekam bentuk endpoint submit laporan Monev
          (docs/MONEV-API.md §8). Nilai rahasia (token/cookie/password) otomatis
          disamarkan dan tidak pernah disimpan.
        </p>
      </div>

      <AnalyzeCaptureForm />
    </main>
  );
}
