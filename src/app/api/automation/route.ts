// src/app/api/automation/route.ts: pengaturan otomasi (SPEC.md §7).
//
// Satu pengguna punya satu AutomationConfig (userId @unique). `webhookKey`
// dibuat sekali secara acak dan TIDAK diganti otomatis, kalau berubah, cron
// yang sudah dipasang pengguna akan mati diam-diam. Pengguna bisa menerbitkan
// key BARU dengan sengaja lewat PUT `action: "rotate-key"` (VERIFY-002).
//
// Keamanan:
//   - GET mengembalikan `webhookKey` hanya ke PEMILIK sesi (bukan rahasia dari
//     dirinya sendiri, ia harus bisa menyalinnya ke cron-job.org). Berbeda dari
//     password Monev yang memang tak pernah boleh terlihat lagi.
//   - PUT tidak pernah membuat key baru kecuali diminta eksplisit via
//     `action: "rotate-key"`; selain itu `webhookKey` lama dipertahankan.
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

/** GET, pengaturan otomasi milik user yang login (atau null bila belum ada). */
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

/** PUT, simpan jam/menit & sakelar. Key baru hanya saat pertama (atau bila rotasi diminta). */
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

  const parsed = automationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 },
    );
  }

  const { isEnabled, hour, minute, action } = parsed.data;

  // Rotasi hanya bila pengguna MEMINTANYA (action: "rotate-key"). Simpan biasa
  // selalu mempertahankan kunci lama supaya cron yang sudah terpasang tidak
  // mati tanpa disadari. Lihat catatan di src/lib/validate.ts.
  const rotateKey = action === "rotate-key";

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
    // `update` TIDAK menyertakan webhookKey kecuali rotasi diminta eksplisit.
    update: rotateKey
      ? { isEnabled, hour, minute, webhookKey: generateWebhookKey() }
      : { isEnabled, hour, minute },
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
