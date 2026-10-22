// src/app/(app)/admin/feedback/page.tsx: baca kritik & saran pengguna.
//
// Satu arah: admin hanya bisa menandai "sudah dibaca" dan menghapus. Tidak ada
// kotak balasan (keputusan pemilik).
//
// ⚠️ Penjagaan sesungguhnya di SERVER (guard di bawah): sesi tanpa
// `role === "ADMIN"` dialihkan ke /dashboard. Menu sidebar hanya menyembunyikan
// tautan (docs/UI-LAYOUT.md §2).
//
// Urutan: BELUM dibaca dulu, lalu yang terbaru. Postgres menaruh NULL di
// BELAKANG pada ASC, jadi `nulls: "first"` ditulis eksplisit — tanpa itu
// masukan baru tenggelam di bawah tumpukan yang sudah selesai.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJakartaTimestamp } from "@/lib/audit-log";
import { describeFeedbackState, feedbackStateTone } from "@/lib/feedback";
import { FeedbackActions } from "./feedback-actions";

/** Batas tampilan; masukan lama yang sudah dibaca tetap tersimpan di DB. */
const BATAS_TAMPIL = 200;

export default async function AdminFeedbackPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;
  if (!isAdminRole(role)) {
    redirect("/dashboard");
  }

  const [rows, belumDibaca] = await Promise.all([
    prisma.feedback.findMany({
      orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: BATAS_TAMPIL,
      select: {
        id: true,
        message: true,
        readAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.feedback.count({ where: { readAt: null } }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8">
        <span className="inline-flex items-center rounded-base border-2 border-border bg-main px-3 py-1 text-xs font-heading text-main-foreground">
          ADMIN
        </span>
        <h1 className="mt-3 font-heading text-3xl">Kritik &amp; Saran</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Masukan dari pengguna aplikasi. Tandai sudah dibaca setelah ditangani,
          atau hapus bila isinya tidak layak disimpan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex flex-wrap items-center gap-2">
              Daftar masukan
              <Badge tone={belumDibaca > 0 ? "neutral" : "good"}>
                {belumDibaca > 0
                  ? `${belumDibaca} belum dibaca`
                  : "Semua sudah dibaca"}
              </Badge>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-foreground/70">
              Belum ada masukan dari pengguna.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => {
                const pengirim =
                  row.user.name?.trim() || row.user.email || "Tanpa nama";
                return (
                  <li
                    key={row.id}
                    className="rounded-base border-2 border-border p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone={feedbackStateTone(row.readAt)}>
                          {describeFeedbackState(row.readAt)}
                        </Badge>
                        <span className="min-w-0 truncate text-xs text-foreground/70">
                          {pengirim}
                        </span>
                        <span className="text-xs text-foreground/60">
                          {formatJakartaTimestamp(row.createdAt) ??
                            "waktu tidak diketahui"}
                        </span>
                      </div>
                      <FeedbackActions
                        id={row.id}
                        sudahDibaca={row.readAt !== null}
                      />
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {row.message}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {rows.length === BATAS_TAMPIL ? (
            <p className="mt-3 text-xs text-foreground/60">
              Menampilkan {BATAS_TAMPIL} masukan pertama. Hapus yang sudah
              selesai untuk melihat sisanya.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
