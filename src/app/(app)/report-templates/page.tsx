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
import { todayInJakarta, plainDateToUtcDate } from "@/lib/submit-service";
import { paginate, parsePage } from "@/lib/audit-log";
import { loadHolidayRows } from "@/lib/holidays-repo";
import ReportTemplatesForm from "./report-templates-form";
import DatedTemplatesTable from "./dated-templates-table";

/** Jumlah baris tabel template khusus per halaman. */
const DATED_PAGE_SIZE = 20;

type ReportTemplatesPageProps = {
  // Di Next.js 16, `searchParams` adalah Promise yang harus di-await.
  searchParams: Promise<{ date?: string; tpage?: string; expand?: string }>;
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

  // Dua query paralel: template default & jumlah baris tabel. Keduanya tidak
  // saling bergantung, jadi tidak perlu berurutan.
  //
  // CATATAN: form HANYA butuh tiga kolom dari template default, bukan daftar
  // seluruh template khusus tanggal. Sebelumnya halaman ini menarik SELURUH
  // tabel lalu memotongnya di memori, dan tabelnya menarik ulang data yang
  // sama — dua salinan penuh di setiap kunjungan, tumbuh terus seiring
  // bertambahnya tanggal.
  const [template, datedCount] = await Promise.all([
    prisma.reportTemplate.findUnique({
      where: { userId: session.user.id },
      select: { activity: true, learning: true, obstacles: true, updatedAt: true },
    }),
    prisma.datedReportTemplate.count({ where: { userId: session.user.id } }),
  ]);

  // Halaman tabel dihitung dari JUMLAH baris di database, bukan dari array yang
  // sudah diambil. `paginate()` tetap mendefinisikan arti "halaman" (dan
  // menjepit `?tpage=999` ke halaman terakhir), lalu `DatedTemplatesTable`
  // memakai `start`/`end` sebagai `skip`/`take`.
  const datedPageInfo = paginate(
    datedCount,
    parsePage(params.tpage),
    DATED_PAGE_SIZE,
  );

  // `?expand=YYYY-MM-DD` membuka teks lengkap satu baris. Divalidasi bentuknya
  // karena nilainya datang dari URL dan dipakai untuk membandingkan tanggal;
  // nilai asing diabaikan (tabel tampil ringkas) alih-alih menampilkan error.
  const expandParam = params.expand;
  const expandedDate =
    typeof expandParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expandParam)
      ? expandParam
      : null;

  // Libur dari tabel admin. Dipakai DUA cara:
  //  - `Set` untuk komponen SERVER (DatedTemplatesTable) — efisien untuk lookup.
  //  - `string[]` untuk komponen KLIEN (form/DatePicker) — Set tidak bisa
  //    melewati batas server→klien (harus serializable).
  const holidayRows = await loadHolidayRows();
  const holidaySet = new Set(holidayRows.map((h) => h.date));
  const holidayDates = holidayRows.map((h) => h.date);

  // Form hanya perlu isi template khusus untuk SATU tanggal: yang sedang
  // dibuka lewat `?date=`. Sebelumnya seluruh daftar ikut dikirim ke komponen
  // klien, padahal form tidak pernah memakainya untuk tanggal lain.
  // `date` unik per pengguna (`userId_date`), jadi satu `findUnique` cukup dan
  // tidak perlu merentang awal/akhir hari.
  const formDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
    ? params.date
    : null;
  const formDateValue = formDate ? plainDateToUtcDate(formDate) : null;

  const formDated = formDateValue
    ? await prisma.datedReportTemplate.findUnique({
        where: { userId_date: { userId: session.user.id, date: formDateValue } },
        select: { activity: true, learning: true, obstacles: true },
      })
    : null;

  // Daftar `[{ date, ...isi }]` sesuai bentuk yang diharapkan form. Kosong bila
  // tanggal itu belum punya template khusus (form memakai isi default).
  const datedTemplatesForForm =
    formDate && formDated
      ? [
          {
            date: formDate,
            activity: formDated.activity,
            learning: formDated.learning,
            obstacles: formDated.obstacles,
          },
        ]
      : [];

  /** Susun URL halaman ini dengan mengganti/membuang beberapa query. */
  const buildUrl = (next: {
    date?: string | null;
    tpage?: number | null;
    expand?: string | null;
  }) => {
    const qs = new URLSearchParams();
    const date = "date" in next ? next.date : params.date;
    const page = "tpage" in next ? next.tpage : parsePage(params.tpage);
    const expand = "expand" in next ? next.expand : expandedDate;
    if (date) qs.set("date", date);
    if (page && page > 1) qs.set("tpage", String(page));
    if (expand) qs.set("expand", expand);
    const s = qs.toString();
    return s ? `/report-templates?${s}` : "/report-templates";
  };

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
          menyetel ulang state komponen tanpa efek `setState` di dalam efek.

          `initialDated` sengaja TIDAK diisi daftar semua tanggal: form hanya
          memakainya untuk tanggal yang sedang dibuka, dan baris itu dimuat
          terpisah di bawah hanya bila memang ada (`?date=`). */}
      <ReportTemplatesForm
        key={params.date ?? "default"}
        hasExisting={Boolean(template)}
        initialActivity={template?.activity ?? ""}
        initialLearning={template?.learning ?? ""}
        initialObstacles={template?.obstacles ?? ""}
        updatedAt={template?.updatedAt?.toISOString() ?? null}
        today={today}
        initialDated={datedTemplatesForForm}
        initialDate={params.date ?? null}
        holidays={holidayDates}
      />

      {/* Daftar template khusus tanggal. Ditaruh SETELAH form karena tombol
          "Buka" di sini mengisi form di atas. Hanya satu halaman (20 baris) yang
          dirender; sisanya lewat kontrol halaman `?tpage=`. */}
      <DatedTemplatesTable
        userId={session.user.id}
        today={today}
        holidays={holidaySet}
        pageInfo={datedPageInfo}
        buildHref={(page) =>
          // `expand` sengaja DIBUANG saat berpindah halaman. Baris yang
          // di-expand ada di halaman lain, jadi mempertahankannya hanya
          // memunculkan banner "Menampilkan teks lengkap tanggal X" di halaman
          // yang tidak memuat tanggal itu — petunjuk yang menyesatkan.
          buildUrl({ tpage: page, expand: null })
        }
        buildExpandHref={(date) => buildUrl({ expand: date })}
        expandedDate={expandedDate}
      />
    </div>
  );
}
