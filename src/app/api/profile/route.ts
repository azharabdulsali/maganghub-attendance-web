// src/app/api/profile/route.ts: ubah nama profil pengguna sendiri.
//
// Kenapa terpisah dari /api/credentials: kredensial berisi rahasia portal Monev
// dan penanganannya ketat (rate limit, dekripsi). Profil hanyalah data biasa
// milik akun aplikasi ini, jadi aturannya lebih sederhana.
//
// Yang dijaga di sini:
//   - Hanya pemilik sesi yang boleh mengubah profilnya sendiri (userId dari
//     sesi, BUKAN dari body, supaya tidak bisa mengubah milik orang lain).
//   - Email & peran TIDAK diterima dari klien. Email adalah identitas login;
//     peran hanya boleh diubah lewat jalur admin/ADMIN_EMAIL (Â§13 baris 8).
//   - Input divalidasi Zod di server sebelum menyentuh DB (AGENTS.md Â§2).

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validate";

/** PATCH, perbarui nama profil user yang sedang login. */
export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." },
      { status: 400 },
    );
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue?.message ?? "Data tidak valid",
        field: typeof issue?.path[0] === "string" ? issue.path[0] : undefined,
      },
      { status: 400 },
    );
  }

  // Nama kosong disimpan sebagai NULL, bukan "", supaya "belum diisi" hanya
  // punya satu bentuk di DB.
  const nama = parsed.data.name.length > 0 ? parsed.data.name : null;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: nama },
    select: { name: true, email: true, role: true },
  });

  return NextResponse.json({ ok: true, ...updated }, { status: 200 });
}
