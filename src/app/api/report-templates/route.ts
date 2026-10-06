// src/app/api/report-templates/route.ts: simpan & baca 3 template laporan.
//
// Berbeda dari kredensial, isi template BUKAN rahasia: boleh dikembalikan penuh
// ke klien supaya pengguna bisa melihat dan mengeditnya. Yang dijaga di sini:
//   - Hanya pemilik sesi yang boleh menyentuh template-nya sendiri.
//   - Teks diseragamkan (spasi tepi dipangkas, CRLF â†’ LF) sebelum disimpan,
//     supaya yang dihitung sama dengan yang ditampilkan portal.
//   - Penolakan di sini mencegah satu percobaan submit yang sia-sia: portal
//     menuntut minimal 100 karakter per field.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportTemplatesSchema } from "@/lib/validate";
import { normalizeReportText } from "@/lib/report-rules";

/** Ambil id user dari sesi; null kalau belum login. */
async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** GET, isi template milik user yang sedang login. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const template = await prisma.reportTemplate.findUnique({
    where: { userId },
    select: { activity: true, learning: true, obstacles: true, updatedAt: true },
  });

  if (!template) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({
    exists: true,
    activity: template.activity,
    learning: template.learning,
    obstacles: template.obstacles,
    updatedAt: template.updatedAt,
  });
}

/** PUT, simpan (buat atau ganti) ketiga template milik user yang login. */
export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." }, { status: 400 });
  }

  const parsed = reportTemplatesSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    // Sertakan nama field supaya form bisa menyorot kotak yang salah.
    return NextResponse.json(
      {
        error: issue?.message ?? "Data tidak valid",
        field: typeof field === "string" ? field : undefined,
      },
      { status: 400 },
    );
  }

  // Seragamkan sebelum simpan. Panjang sudah dinilai skema; normalisasi di sini
  // tidak akan mengubah validitas, hanya merapikan bentuk tersimpannya.
  const data = {
    activity: normalizeReportText(parsed.data.activity),
    learning: normalizeReportText(parsed.data.learning),
    obstacles: normalizeReportText(parsed.data.obstacles),
  };

  // upsert: satu user hanya punya satu set template (userId @unique).
  const saved = await prisma.reportTemplate.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: { activity: true, learning: true, obstacles: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, ...saved }, { status: 200 });
}

/** DELETE, hapus template milik user yang login. */
export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const existing = await prisma.reportTemplate.findUnique({
    where: { userId },
    select: { userId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Belum ada template" }, { status: 404 });
  }

  await prisma.reportTemplate.delete({ where: { userId } });

  return NextResponse.json({ ok: true });
}
