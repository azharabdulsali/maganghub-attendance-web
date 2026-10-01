// src/lib/admin-action-log.ts: pencatatan aksi admin.
//
// Aksi admin yang menyentuh akun orang lain (hapus / atur ulang kata sandi)
// dicatat ke tabel `AdminActionLog` supaya bisa diaudit — terpisah dari
// `SubmitLog` yang artinya percobaan kirim laporan.
//
// Pencatatan TIDAK boleh menggagalkan aksi yang sudah sah, dan tidak boleh
// membuat endpoint crash bila tabel belum ada (mis. sebelum `prisma db push`
// dijalankan di lingkungan itu). Karena itu penulisan DB dibungkus try/catch,
// dan bila gagal, baris tetap dicetak ke log server sebagai jaring pengaman.
//
// ⚠️ JANGAN pernah menaruh kata sandi (mentah maupun hash) atau token di sini.
// Yang dicatat hanyalah jenis aksi, id aktor/sasaran, dan alasan penolakan.

import { prisma } from "@/lib/prisma";
import type { AdminActionType } from "@/generated/prisma/enums";

export type AdminActionOutcome = "success" | "denied" | "error";

export interface AdminActionFields {
  actorId: string;
  targetId: string;
  /** Alasan penolakan (mis. "SELF"). Tidak rahasia. */
  reason?: string;
}

/**
 * Catat satu aksi admin. Tidak pernah melempar.
 *
 * @param action  Jenis aksi (enum database).
 * @param fields  Id aktor/sasaran + alasan opsional.
 * @param outcome Hasil. Saat ini hanya aksi `success`/`denied` yang punya
 *                padanan di tabel; `error` hanya dicatat ke log server.
 */
export async function logAdminAction(
  action: AdminActionType,
  fields: AdminActionFields,
  outcome: AdminActionOutcome = "success",
): Promise<void> {
  const entry = {
    scope: "adminAction",
    action,
    outcome,
    ...fields,
    at: new Date().toISOString(),
  };

  if (outcome === "success" || outcome === "denied") {
    try {
      await prisma.adminActionLog.create({
        data: {
          action,
          actorId: fields.actorId,
          targetId: fields.targetId,
          reason: fields.reason ?? (outcome === "denied" ? "DENIED" : null),
        },
      });
      return;
    } catch {
      // Tabel belum ada / DB tak terjangkau → jangan gagalkan aksi, jatuh ke log.
    }
  }

  try {
    // Satu baris JSON agar mudah diparse/difilter di log host (Vercel, dsb.).
    console.info(JSON.stringify(entry));
  } catch {
    // Sengaja diabaikan: log gagal bukan alasan menggagalkan operasi.
  }
}

