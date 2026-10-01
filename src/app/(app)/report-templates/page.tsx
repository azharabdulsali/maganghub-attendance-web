// src/app/(app)/report-templates/page.tsx: halaman 3 template laporan.
//
// Server component: memeriksa sesi & mengambil template awal dari database,
// lalu menyerahkan tampilan ke form (client component).
//
// Berbeda dari kredensial, isi template memang dikirim ke halaman, pengguna
// harus bisa melihat dan menyuntingnya sendiri.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayInJakarta, toPlainDate } from "@/lib/submit-service";
import ReportTemplatesForm from "./report-templates-form";
import DatedTemplatesList from "./dated-templates-list";
import RecentSubmitHistory from "./recent-submit-history";

export default async function ReportTemplatesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const template = await prisma.reportTemplate.findUnique({
    where: { userId: session.user.id },
    select: { activity: true, learning: true, obstacles: true, updatedAt: true },
  });

  // Template khusus tanggal (penimpa). Diambil sekaligus agar tidak ada dua
  // query berurutan pada halaman yang sama.
  const datedRows = await prisma.datedReportTemplate.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "asc" },
    select: {
      date: true,
      activity: true,
      learning: true,
      obstacles: true,
      updatedAt: true,
    },
  });

  const datedTemplates = datedRows.map((r) => ({
    date: toPlainDate(r.date),
    activity: r.activity,
    learning: r.learning,
    obstacles: r.obstacles,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl">Template Laporan</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Isi ini dipakai berulang setiap hari absensi. Portal Maganghub menuntut
          minimal 100 karakter per kolom.
        </p>
      </div>

      <ReportTemplatesForm
        hasExisting={Boolean(template)}
        initialActivity={template?.activity ?? ""}
        initialLearning={template?.learning ?? ""}
        initialObstacles={template?.obstacles ?? ""}
        updatedAt={template?.updatedAt?.toISOString() ?? null}
      />

      {/* Template khusus tanggal, ditaruh SETELAH form harian karena ia
          "penimpa": pengguna perlu memahami dasar (harian) lebih dulu. */}
      <DatedTemplatesList
        today={todayInJakarta()}
        initialTemplates={datedTemplates}
      />

      {/* Ringkasan riwayat submit, ditaruh SETELAH template karena sifatnya
          informasi pendukung, bukan aksi utama halaman ini. */}
      <RecentSubmitHistory userId={session.user.id} />
    </div>
  );
}
