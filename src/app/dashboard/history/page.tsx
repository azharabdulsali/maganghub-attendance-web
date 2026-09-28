// src/app/dashboard/history/page.tsx — riwayat audit log submit (Tahap 5).
//
// Server component: memeriksa sesi, mengambil SubmitLog milik pengguna (paling
// baru 100), lalu menampilkan ringkasan + tabel. Semua pemformatan diserahkan
// ke lib/audit-log.ts yang murni dan teruji.
//
// Prinsip (SPEC.md §7, §10): setiap percobaan submit PASTI tercatat di sini —
// sukses, duplikat, maupun gagal. Halaman ini adalah bukti "sudah dikirim" bila
// disengketakan, jadi TIDAK ada tombol edit/hapus di sini.

import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  badgeVariant,
  describeSubmitStatus,
  describeTrigger,
  formatJakartaTimestamp,
  summarizeLogs,
  type BadgeVariant,
} from "@/lib/audit-log";

/** Kelas Tailwind per warna badge (pola sama dengan badge peran di dashboard). */
const BADGE_CLASS: Record<BadgeVariant, string> = {
  success: "bg-main text-main-foreground",
  warning: "bg-secondary-background text-foreground",
  failure: "bg-foreground text-background",
};

const MAX_ROWS = 100;

export default async function HistoryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const logs = await prisma.submitLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: {
      id: true,
      status: true,
      message: true,
      httpCode: true,
      trigger: true,
      attempt: true,
      createdAt: true,
    },
  });

  const summary = summarizeLogs(logs);
  const lastAt = summary.lastAt ? formatJakartaTimestamp(summary.lastAt) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm font-heading underline underline-offset-4"
        >
          ← Kembali ke dashboard
        </Link>
        <h1 className="mt-4 font-heading text-3xl">Riwayat Absensi</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Catatan setiap percobaan kirim laporan. Sukses, duplikat, dan gagal
          semuanya tercatat — ini bukti resmi bila ada sengketa kehadiran.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Ringkasan</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total" value={summary.total} />
          <Stat label="Terkirim" value={summary.success} />
          <Stat label="Sudah ada" value={summary.duplicate} />
          <Stat label="Gagal" value={summary.failed} />
          <p className="col-span-2 text-xs text-foreground/60 sm:col-span-4">
            {lastAt
              ? `Percobaan terakhir: ${lastAt}`
              : "Belum ada percobaan kirim."}
          </p>
        </CardContent>
      </Card>

      {logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-sm text-foreground/70">
            Belum ada riwayat. Setelah Anda menekan “Kirim Absen”, catatan akan
            muncul di sini.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {logs.map((log) => {
              const when = formatJakartaTimestamp(log.createdAt);
              return (
                <div
                  key={log.id}
                  className="rounded-base border-2 border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-base border-2 border-border px-2 py-0.5 text-xs font-heading ${
                        BADGE_CLASS[badgeVariant(log.status)]
                      }`}
                    >
                      {describeSubmitStatus(log.status)}
                    </span>
                    <span className="text-xs text-foreground/60">
                      {describeTrigger(log.trigger)}
                    </span>
                    {typeof log.httpCode === "number" && (
                      <span className="text-xs text-foreground/60">
                        HTTP {log.httpCode}
                      </span>
                    )}
                    {log.attempt > 1 && (
                      <span className="text-xs text-foreground/60">
                        Percobaan ke-{log.attempt}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-foreground/60">
                      {when ?? "waktu tidak diketahui"}
                    </span>
                  </div>
                  {log.message && (
                    <p className="mt-2 text-sm text-foreground/80">
                      {log.message}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {logs.length === MAX_ROWS && (
        <p className="mt-4 text-xs text-foreground/60">
          Menampilkan {MAX_ROWS} catatan terbaru.
        </p>
      )}
    </main>
  );
}

/** Kartu angka kecil untuk ringkasan. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-base border-2 border-border p-3">
      <p className="font-heading text-2xl">{value}</p>
      <p className="text-xs text-foreground/60">{label}</p>
    </div>
  );
}
