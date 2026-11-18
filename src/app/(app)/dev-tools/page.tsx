// src/app/(app)/dev-tools/page.tsx: alat diagnostik (khusus admin).
//
// Tujuan: membantu pemilik akun merekam SATU kali klik "Simpan dan Kirim" di
// browsernya sendiri, lalu menemukan bentuk endpoint submit (§8). Halaman ini
// tidak pernah mengirim apa pun ke portal Monev, ia hanya menganalisis teks
// rekaman yang ditempel.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
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
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title="Alat Diagnostik"
        description="Khusus admin. Merekam bentuk permintaan kirim laporan Monev. Nilai rahasia (token, cookie, password) otomatis disamarkan dan tidak disimpan."
      />

      <AnalyzeCaptureForm />
    </div>
  );
}
