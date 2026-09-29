// src/app/api/automation/route.ts — pengaturan otomasi (SPEC.md §7).
//
// Satu pengguna punya satu AutomationConfig (userId @unique). `webhookKey`
// dibuat sekali secara acak dan TIDAK pernah diganti otomatis — kalau berubah,
// cron yang sudah dipasang pengguna akan mati diam-diam.
//
// Keamanan:
//   - GET mengembalikan `webhookKey` hanya ke PEMILIK sesi (bukan rahasia dari
//     dirinya sendiri — ia harus bisa menyalinnya ke cron-job.org). Berbeda dari
//     password Monev yang memang tak pernah boleh terlihat lagi.
//   - PUT tidak pernah membuat key baru bila config sudah ada; `webhookKey`
//     lama dipertahankan.
//   - Zona waktu selalu diisi server ("Asia/Jakarta"), bukan dari klien.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { automationSchema } from "@/lib/validate";
import { AUTOMATION_TIMEZONE, generateWebhookKey } from "@/lib/automation";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** GET — pengaturan otomasi milik user yang login (atau null bila belum ada). */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const config = await prisma.automationConfig.findUnique({
    where: { userId },
    select: {
      isEnabled: true,
      webhookKey: true,
      hour: true,
      minute: true,
      timezone: true,
      updatedAt: true,
    },
  });

  if (!config) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({
    exists: true,
    isEnabled: config.isEnabled,
    webhookKey: config.webhookKey,
    hour: config.hour,
    minute: config.minute,
    timezone: config.timezone,
    updatedAt: config.updatedAt,
  });
}

/** PUT — simpan jam/menit & sakelar aktif. Membuat key baru HANYA saat pertama. */
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

  const parsed = automationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 },
    );
  }

  const { isEnabled, hour, minute } = parsed.data;

  // `update` sengaja TIDAK menyertakan webhookKey → key lama dipertahankan.
  // Pada `create`, key dibuat acak sekali di sini.
  const saved = await prisma.automationConfig.upsert({
    where: { userId },
    create: {
      userId,
      isEnabled,
      hour,
      minute,
      timezone: AUTOMATION_TIMEZONE,
      webhookKey: generateWebhookKey(),
    },
    update: { isEnabled, hour, minute },
    select: {
      isEnabled: true,
      webhookKey: true,
      hour: true,
      minute: true,
      timezone: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    isEnabled: saved.isEnabled,
    // Key dikembalikan supaya UI bisa langsung menampilkan tautan cron;
    // ini milik pengguna sendiri, bukan kredensial pihak ketiga.
    webhookKey: saved.webhookKey,
    hour: saved.hour,
    minute: saved.minute,
    timezone: saved.timezone,
    updatedAt: saved.updatedAt,
  });
}
