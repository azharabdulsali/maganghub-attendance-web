// src/app/(app)/report-templates/page.tsx: halaman template laporan.
//
// Server component: memeriksa sesi & mengambil template awal dari database,
// lalu menyerahkan tampilan ke form (client component).
//
// Satu form saja. Template default (berlaku semua tanggal) dan template
// khusus per tanggal disatukan lewat date picker di dalam form, supaya
// pengguna tidak dibuat bingung oleh dua panel yang mirip.
//
// Berbeda dari kredensial, isi template memang dikirim ke halaman, pengguna
// harus bisa melihat dan menyuntingnya sendiri.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayInJakarta, toPlainDate } from "@/lib/submit-service";
import ReportTemplatesForm from "./report-templates-form";
import DatedTemplatesTable from "./dated-templates-table";

type ReportTemplatesPageProps = {
  // Di Next.js 16, `searchParams` adalah Promise yang harus di-await.
  searchParams: Promise<{ date?: string }>;
};

export default async function ReportTemplatesPage({
  searchParams,
}: ReportTemplatesPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const today = todayInJakarta();

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
    },
  });

  const datedTemplates = datedRows.map((r) => ({
    date: toPlainDate(r.date),
    activity: r.activity,
    learning: r.learning,
    obstacles: r.obstacles,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl">Template Laporan</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Isi ini dipakai berulang setiap hari absensi. Portal Maganghub menuntut
          minimal 100 karakter per kolom. Ingin laporan berbeda pada satu tanggal
          tertentu? Isi kolom tanggal di bawah, isi template akan berganti.
        </p>
      </div>

      {/* `key` berdasarkan tanggal yang diminta: tombol "Buka" di tabel
          menavigasi ke rute ini dengan `?date=`, dan tanpa `key` komponen klien
          ini TIDAK dipasang ulang, sehingga form tetap menampilkan tanggal lama
          (gejala "Buka tidak melakukan apa-apa"). Mengganti `key` memaksa React
          memasang ulang form dengan `initialDate` yang baru — cara idiomatik
          menyetel ulang state komponen tanpa efek `setState` di dalam efek. */}
      <ReportTemplatesForm
        key={params.date ?? "default"}
        hasExisting={Boolean(template)}
        initialActivity={template?.activity ?? ""}
        initialLearning={template?.learning ?? ""}
        initialObstacles={template?.obstacles ?? ""}
        updatedAt={template?.updatedAt?.toISOString() ?? null}
        today={today}
        initialDated={datedTemplates}
        initialDate={params.date ?? null}
      />

      {/* Daftar template khusus tanggal. Ditaruh SETELAH form karena tombol
          "Buka" di sini mengisi form di atas. */}
      <DatedTemplatesTable userId={session.user.id} today={today} />
    </div>
  );
}
