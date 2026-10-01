// src/app/api/report-templates/dated/route.ts: template laporan per-tanggal.
//
// Ini "penimpa" template harian (lihat src/lib/template-selection.ts): saat
// mengirim laporan untuk tanggal X, isi di sini dipakai BILA ADA; kalau tidak
// ada, template harian yang dipakai.
//
// Keamanan & konsistensi (sama seperti route template harian):
//   - Hanya pemilik sesi yang boleh menyentuh datanya sendiri.
//   - Body TIDAK pernah memuat userId; selalu dari sesi.
//   - Data dikembalikan penuh ke klien (template bukan rahasia).
//
// Yang penting dipahami: menyimpan template bertanggal TIDAK berarti laporan
// akan terkirim di tanggal itu. Aturan libur/akhir pekan/akhir program tetap
// berlaku saat pengiriman (report-policy.ts). Jadi tanggal Sabtu boleh
// disimpan, tetapi otomasi tetap melewatinya.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { datedReportTemplateSchema } from "@/lib/validate";
import { normalizeReportText } from "@/lib/report-rules";
import { plainDateToUtcDate, toPlainDate } from "@/lib/submit-service";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** GET, semua template bertanggal milik user, terurut tanggal naik. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const rows = await prisma.datedReportTemplate.findMany({
    where: { userId },
    orderBy: { date: "asc" },
    select: {
      date: true,
      activity: true,
      learning: true,
      obstacles: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    exists: rows.length > 0,
    templates: rows.map((r) => ({
      date: toPlainDate(r.date),
      activity: r.activity,
      learning: r.learning,
      obstacles: r.obstacles,
      updatedAt: r.updatedAt,
    })),
  });
}

/**
 * PUT, buat/ganti template untuk SATU tanggal.
 *
 * `upsert` pada (userId, date): menyimpan tanggal yang sudah ada akan
 * MENGGANTI isinya, bukan membuat baris kedua. Ini disengaja, satu tanggal
 * hanya boleh punya satu template (`@@unique([userId, date])`).
 */
export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan salah" }, { status: 400 });
  }

  const parsed = datedReportTemplateSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return NextResponse.json(
      {
        error: issue?.message ?? "Data tidak valid",
        field: typeof field === "string" ? field : undefined,
      },
      { status: 400 },
    );
  }

  const dateValue = plainDateToUtcDate(parsed.data.date);
  if (!dateValue) {
    // Tidak seharusnya terjadi (skema sudah menyaring), jaring pengaman.
    return NextResponse.json({ error: "Tanggal tidak sah." }, { status: 400 });
  }

  const data = {
    activity: normalizeReportText(parsed.data.activity),
    learning: normalizeReportText(parsed.data.learning),
    obstacles: normalizeReportText(parsed.data.obstacles),
  };

  const saved = await prisma.datedReportTemplate.upsert({
    where: { userId_date: { userId, date: dateValue } },
    create: { userId, date: dateValue, ...data },
    update: data,
    select: { date: true, activity: true, learning: true, obstacles: true },
  });

  return NextResponse.json(
    { ok: true, ...saved, date: toPlainDate(saved.date) },
    { status: 200 },
  );
}

/**
 * DELETE, hapus template untuk satu tanggal.
 *
 * Tanggal diambil dari query string (`?date=YYYY-MM-DD`), bukan body, karena
 * DELETE dengan body tidak didukung merata.
 *
 * Yang SENGAJA tidak dilakukan: menghapus `Report` yang pernah terkirim untuk
 * tanggal itu. Riwayat pengiriman adalah bukti, bukan bagian dari template.
 */
export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const dateParam = new URL(request.url).searchParams.get("date")?.trim() ?? "";
  const dateValue = plainDateToUtcDate(dateParam);
  if (!dateValue) {
    return NextResponse.json(
      { error: "Parameter 'date' wajib berformat YYYY-MM-DD." },
      { status: 400 },
    );
  }

  const existing = await prisma.datedReportTemplate.findUnique({
    where: { userId_date: { userId, date: dateValue } },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Tidak ada template untuk tanggal itu." },
      { status: 404 },
    );
  }

  await prisma.datedReportTemplate.delete({
    where: { userId_date: { userId, date: dateValue } },
  });

  return NextResponse.json({ ok: true, date: dateParam });
}