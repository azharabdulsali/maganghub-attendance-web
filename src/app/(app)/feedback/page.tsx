// src/app/(app)/feedback/page.tsx: kirim kritik & saran ke admin.
//
// Halaman pengguna biasa. Isinya dua bagian:
//   1. Form kirim masukan (client component, ./feedback-form.tsx).
//   2. Riwayat masukan milik SENDIRI + status "sudah dibaca" dari admin.
//
// Satu arah: tidak ada balasan admin di sini. Status baca saja supaya pengguna
// tahu masukannya tidak hilang ke ruang kosong.
//
// Data masukan TIDAK rahasia (ditulis oleh pengguna sendiri), jadi boleh
// dikembalikan penuh ke halaman ini. Yang dijaga adalah masukan orang lain:
// query di bawah SELALU difilter `userId` sesi.

import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJakartaTimestamp } from "@/lib/audit-log";
import { describeFeedbackState, feedbackStateTone } from "@/lib/feedback";
import { FeedbackForm } from "./feedback-form";

/** Riwayat yang ditampilkan sekaligus; lebih dari ini jarang berguna. */
const RIWAYAT_BATAS = 50;

export default async function FeedbackPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const rows = await prisma.feedback.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: RIWAYAT_BATAS,
    select: { id: true, message: true, readAt: true, createdAt: true },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title="Kritik & Saran"
        description="Sampaikan masukan untuk perbaikan aplikasi."
      />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Kirim masukan baru</CardTitle>
        </CardHeader>
        <CardContent>
          <FeedbackForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Masukan Anda</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={<MessageSquare aria-hidden />}
              title="Belum ada masukan yang Anda kirim"
              description="Kritik dan saran yang Anda tulis lewat formulir di atas akan tampil di sini, supaya Anda bisa memeriksa apa yang sudah dikirim."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-base border-2 border-border p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={feedbackStateTone(row.readAt)}>
                      {describeFeedbackState(row.readAt)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatJakartaTimestamp(row.createdAt) ??
                        "waktu tidak diketahui"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {row.message}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {rows.length === RIWAYAT_BATAS ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Menampilkan {RIWAYAT_BATAS} masukan terbaru.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
