// src/app/(app)/automation/page.tsx: pengaturan otomasi harian (Tahap 5).
//
// Server component: sesi → ambil AutomationConfig. Form (client) menyunting
// JAM & sakelar; menit selalu 00 karena dispatcher hanya mencocokkan jam.
// Kunci "tautan otomatis" ditampilkan agar bisa ditempel ke layanan penjadwal
// (mis. cron-job.org). Zona waktu selalu Asia/Jakarta.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import AutomationForm from "./automation-form";

export default async function AutomationPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // `minute` sengaja TIDAK diambil: form hanya menyunting jam (menit selalu 00).
  const config = await prisma.automationConfig.findUnique({
    where: { userId: session.user.id },
    select: {
      isEnabled: true,
      webhookKey: true,
      hour: true,
      timezone: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title="Otomasi Absensi"
        description="Kirim laporan otomatis pada hari kerja Anda, di jam pilihan Anda."
      />

      <AutomationForm
        hasExisting={Boolean(config)}
        initialEnabled={config?.isEnabled ?? false}
        initialHour={config?.hour ?? 7}
        initialWebhookKey={config?.webhookKey ?? null}
      />
    </div>
  );
}
