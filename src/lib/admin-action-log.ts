// src/lib/admin-action-log.ts: pencatatan aksi admin (lapisan sementara).
//
// Rencana penuh: aksi destruktif admin (hapus pengguna, reset kata sandi) dicatat
// ke tabel `AdminActionLog` supaya bisa diaudit. Tabel itu belum ada di skema,
// dan menambahkannya menuntut migrasi Neon — yang di tahap ini belum dijalankan.
//
// Sementara ini aksi tetap dicatat, tetapi ke log server (stdout) sebagai satu
// baris JSON, sehingga tidak hilang begitu saja. Saat `AdminActionLog` dibuat,
// fungsi ini tinggal diarahkan ke Prisma tanpa mengubah pemanggilnya.
//
// ⚠️ JANGAN pernah menaruh kata sandi (mentah maupun hash) atau token di sini.
// Yang dicatat hanyalah id, jenis aksi, hasil, dan alasan penolakan.

export type AdminActionOutcome = "success" | "denied" | "error";

export interface AdminActionFields {
  actorId: string;
  targetId: string;
  outcome: AdminActionOutcome;
  /** Alasan penolakan (mis. "SELF") atau kode kesalahan singkat. Tidak rahasia. */
  reason?: string;
}

/** Catat satu aksi admin. Tidak pernah melempar — pencatatan tak boleh menggagalkan aksi sah. */
export function logAdminAction(
  action: string,
  fields: AdminActionFields,
): void {
  try {
    const line = JSON.stringify({
      scope: "adminAction",
      action,
      ...fields,
      at: new Date().toISOString(),
    });
    // Satu baris agar mudah diparse/difilter di log host (Vercel, dsb.).
    console.info(line);
  } catch {
    // Sengaja diabaikan: log gagal bukan alasan menggagalkan operasi.
  }
}
