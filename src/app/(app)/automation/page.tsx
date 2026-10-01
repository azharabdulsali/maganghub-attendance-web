// src/app/(app)/automation/page.tsx: pengaturan otomasi harian (Tahap 5).
//
// Server component: sesi → ambil AutomationConfig. Form (client) menyunting
// jam/menit & sakelar. Kunci "tautan otomatis" ditampilkan agar bisa ditempel
// ke layanan penjadwal (mis. cron-job.org). Zona waktu selalu Asia/Jakarta.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AutomationForm from "./automation-form";

export default async function AutomationPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const config = await prisma.automationConfig.findUnique({
    where: { userId: session.user.id },
    select: {
      isEnabled: true,
      webhookKey: true,
      hour: true,
      minute: true,
      timezone: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl">Otomasi Absensi</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Minta layanan penjadwal otomatis memanggil tautan di bawah ini setiap
          hari pada jam yang Anda pilih (zona Asia/Jakarta). Aplikasi tetap
          memeriksa hari libur dan akhir program sebelum mengirim.
        </p>
      </div>

      <AutomationForm
        hasExisting={Boolean(config)}
        initialEnabled={config?.isEnabled ?? false}
        initialHour={config?.hour ?? 7}
        initialMinute={config?.minute ?? 30}
        initialWebhookKey={config?.webhookKey ?? null}
      />
    </div>
  );
}
