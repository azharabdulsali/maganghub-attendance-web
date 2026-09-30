// src/app/api/account/sessions/revoke/route.ts: cabut semua sesi perangkat lain.
//
// Sesi aplikasi ini memakai JWT, jadi tidak ada daftar sesi yang bisa dihapus
// satu per satu. Sebagai gantinya, `User.sessionVersion` dinaikkan: seluruh JWT
// yang masih memuat versi lama tak lagi cocok dengan DB, dan callback `jwt`
// mengembalikan null → cookie sesi perangkat itu dibersihkan.
//
// Endpoint ini TIDAK mengeluarkan perangkat yang sedang memakainya: nilai
// versi baru dikembalikan supaya klien memperbarui sesinya sendiri lewat
// `useSession().update({ sessionVersion })`. Untuk keluar dari SEMUA perangkat
// termasuk yang ini, klien cukup memanggil `signOut()` setelahnya.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  // Batasi agar tombol ini tidak bisa dipakai sebagai vektor DoS ringan:
  // tiap panggilan menulis ke DB dan memaksa semua sesi lain login ulang.
  const gate = await enforceRateLimit(
    "sessionRevoke",
    rateLimitKey("sessionRevoke", userId),
  );
  if (!gate.decision.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(
          gate.decision.retryAfterSeconds / 60,
        )} menit.`,
      },
      { status: 429, headers: gate.headers },
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });

  return NextResponse.json({ ok: true, sessionVersion: updated.sessionVersion });
}
