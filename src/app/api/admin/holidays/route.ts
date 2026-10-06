// src/app/api/admin/holidays/route.ts: kelola daftar libur (KHUSUS ADMIN).
//
// SPEC.md Â§4 memberi admin kendali lintas pengguna; salah satu wujudnya adalah
// daftar libur nasional yang menentukan KAPAN otomasi melewati sebuah tanggal
// (`decide()` di report-policy.ts). Sebelumnya daftar ini data statis di kode;
// kini disimpan di tabel `holidays` dan dikelola dari sini.
//
// Bentuk endpoint mengikuti pola admin lain (/api/admin/users/[id]):
//   - Guard: sesi + role ADMIN di SERVER (bukan sekadar menyembunyikan menu).
//   - Rate limit scope `adminUserAction` (sama kelas: aksi admin ke DB).
//   - Validasi lewat `validateHolidayInput` (murni, teruji).
//
// GET  /api/admin/holidays        â†’ daftar semua libur (terurut).
// POST /api/admin/holidays        â†’ tambah libur baru (body: date, name, kind).
// PUT  /api/admin/holidays        â†’ ubah libur berdasarkan `id` di body.
// DELETE /api/admin/holidays?id=  â†’ hapus libur (id di query, bukan body).

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/admin";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { plainDateToUtcDate, toPlainDate } from "@/lib/submit-service";
import { loadHolidayRows } from "@/lib/holidays-repo";
import { validateHolidayInput } from "@/lib/holiday-admin";

/** Guard bersama: mengembalikan id admin, atau NextResponse penolakan. */
async function requireAdmin(): Promise<
  { ok: true; actorId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Belum masuk" }, { status: 401 }),
    };
  }
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!isAdminRole(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Hanya admin yang boleh mengelola daftar libur." },
        { status: 403 },
      ),
    };
  }
  const gate = await enforceRateLimit(
    "adminUserAction",
    rateLimitKey("adminUserAction", actorId),
  );
  if (!gate.decision.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Terlalu banyak aksi. Coba lagi dalam ${Math.ceil(
            gate.decision.retryAfterSeconds / 60,
          )} menit.`,
        },
        { status: 429, headers: gate.headers },
      ),
    };
  }
  return { ok: true, actorId };
}

/** GET, semua libur terurut tanggal menaik. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rows = await loadHolidayRows();
  return NextResponse.json({ holidays: rows });
}

/** POST, tambah libur baru. Menolak tanggal yang sudah terdaftar (409). */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." }, { status: 400 });
  }

  const raw = (body ?? {}) as { date?: unknown; name?: unknown; kind?: unknown };
  const parsed = validateHolidayInput(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, field: parsed.field },
      { status: 400 },
    );
  }

  const dateValue = plainDateToUtcDate(parsed.date);
  if (!dateValue) {
    return NextResponse.json({ error: "Tanggal tidak sah." }, { status: 400 });
  }

  const existing = await prisma.holiday.findUnique({
    where: { date: dateValue },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Tanggal ${parsed.date} sudah terdaftar sebagai libur.` },
      { status: 409 },
    );
  }

  const saved = await prisma.holiday.create({
    data: { date: dateValue, name: parsed.name, kind: parsed.kind },
    select: { id: true, date: true, name: true, kind: true },
  });

  return NextResponse.json(
    { ok: true, holiday: { ...saved, date: toPlainDate(saved.date) } },
    { status: 201 },
  );
}

/** PUT, ubah nama/jenis libur berdasarkan `id` di body. Tanggal boleh diubah. */
export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Data yang dikirim tidak terbaca. Muat ulang halaman lalu coba lagi." }, { status: 400 });
  }

  const raw = (body ?? {}) as {
    id?: unknown;
    date?: unknown;
    name?: unknown;
    kind?: unknown;
  };
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) {
    return NextResponse.json(
      { error: "Data libur tidak lengkap. Muat ulang halaman lalu coba lagi.", field: "id" },
      { status: 400 },
    );
  }

  const parsed = validateHolidayInput(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, field: parsed.field },
      { status: 400 },
    );
  }

  const dateValue = plainDateToUtcDate(parsed.date);
  if (!dateValue) {
    return NextResponse.json({ error: "Tanggal tidak sah." }, { status: 400 });
  }

  const target = await prisma.holiday.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Libur tidak ditemukan." }, { status: 404 });
  }

  // Ganti tanggal harus memastikan tanggal baru belum dipakai baris LAIN.
  const clash = await prisma.holiday.findUnique({
    where: { date: dateValue },
    select: { id: true },
  });
  if (clash && clash.id !== id) {
    return NextResponse.json(
      { error: `Tanggal ${parsed.date} sudah terdaftar sebagai libur.` },
      { status: 409 },
    );
  }

  const saved = await prisma.holiday.update({
    where: { id },
    data: { date: dateValue, name: parsed.name, kind: parsed.kind },
    select: { id: true, date: true, name: true, kind: true },
  });

  return NextResponse.json({
    ok: true,
    holiday: { ...saved, date: toPlainDate(saved.date) },
  });
}

/** DELETE, hapus libur. Id dari query (`?id=`), karena DELETE berbody tak merata. */
export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json(
      { error: "Data libur tidak lengkap. Muat ulang halaman lalu coba lagi." },
      { status: 400 },
    );
  }

  const target = await prisma.holiday.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Libur tidak ditemukan." }, { status: 404 });
  }

  await prisma.holiday.delete({ where: { id } });
  return NextResponse.json({ ok: true, id });
}
