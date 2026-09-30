// src/app/api/admin/dispatch/route.ts — picu dispatcher massal dari panel admin.
//
// Alternatif dari menekan "Run workflow" di GitHub: admin login bisa memicu
// pemrosesan manual untuk user yang jadwalnya (!) jatuh pada jam WIB sekarang.
// Berguna untuk menguji jelang produksi atau mengejar ketertinggalan.
//
// Keamanan:
//   - WAJIB sesi + role ADMIN (dicek di server, bukan sekadar sembunyikan tombol).
//   - Tidak menerima parameter apa pun dari klien — tidak bisa disuruh
//     memproses user sembarangan; seleksi sepenuhnya di server (runDispatch).
//   - Logika kirim identik dengan /api/cron/run-all (lib/cron-dispatch-run.ts).

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/admin";
import { runDispatch } from "@/lib/cron-dispatch-run";

// Sama seperti route cron: banyak user per pemanggilan → butuh waktu.
export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }
  if (!isAdminRole(role)) {
    return NextResponse.json(
      { error: "Hanya admin yang boleh memicu pengiriman massal." },
      { status: 403 },
    );
  }

  const summary = await runDispatch();
  return NextResponse.json(summary);
}
