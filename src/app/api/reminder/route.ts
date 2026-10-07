// src/app/api/reminder/route.ts: status & setelan pengingat "belum absen".
//
// Dua peran dalam satu endpoint:
//   GET  /api/reminder  → untuk USER: "haruskah saya menampilkan popup sekarang?"
//   PUT  /api/reminder  → untuk ADMIN: simpan jam:menit & saklar on/off.
//
// Kenapa dipisah per metode (bukan dua file): keduanya mengurus SATU konsep
// (pengingat absen), dan GET/PUT sudah membawa perbedaan hak akses yang jelas.
// Solidaritas ini sama seperti /api/admin/holidays yang juga satu file 4 metode.
//
// Prinsip keamanan:
//   - GET hanya butuh sesi (pengguna memeriksa DIRINYA sendiri; "belum absen
//     hari ini" dihitung dari userId di sesi, BUKAN dari parameter klien, jadi
//     tak ada cara memeriksa status orang lain).
//   - PUT hanya ADMIN (diperiksa di server, bukan sekadar menyembunyikan menu).
//   - Tidak membocorkan apa pun tentang pengguna lain maupun kredensial.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/admin";
import { rateLimitKey } from "@/lib/rate-limit";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { jakartaDayRange } from "@/lib/admin-automation";
import { isWorkingDay } from "@/lib/report-policy";
import { loadHolidaySet } from "@/lib/holidays-repo";
import {
  jakartaClock,
  shouldShowReminder,
  validateReminderSettingInput,
} from "@/lib/reminder-policy";
import {
  loadReminderSetting,
  saveReminderSetting,
} from "@/lib/reminder-setting-repo";

/**
 * GET, status pengingat untuk pengguna yang sedang masuk.
 *
 * Server menyiapkan FAKTA (jam WIB, hari kerja?, sudah absen?) lalu menyerahkan
 * keputusan ke `shouldShowReminder` (murni, teruji). Klien hanya membaca
 * `show` — aturan tidak diduplikasi di peramban.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }

  const gate = await enforceRateLimit(
    "reminderCheck",
    rateLimitKey("reminderCheck", userId),
  );
  if (!gate.decision.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
      { status: 429, headers: gate.headers },
    );
  }

  const now = new Date();
  const clock = jakartaClock(now);
  const range = jakartaDayRange(now);

  const [setting, holidays] = await Promise.all([
    loadReminderSetting(),
    loadHolidaySet(),
  ]);

  // "Sudah absen hari ini" = ada SubmitLog APA PUN hari ini (SUCCESS/FAILED/
  // DUPLICATE). Definisi ini SAMA dengan badge admin (`assessTodayRun`): yang
  // dihitung adalah "otomasi mencoba absen hari ini", bukan hanya sukses. Bila
  // rentang hari tak sah (tidak seharusnya), anggap belum absen tapi tetap
  // hormati jendela waktu — lebih aman menahan popup daripada salah muncul.
  let hasSubmittedToday = false;
  if (range) {
    const count = await prisma.submitLog.count({
      where: {
        userId,
        createdAt: { gte: range.start, lt: range.end },
      },
    });
    hasSubmittedToday = count > 0;
  }

  const show = shouldShowReminder(setting, {
    nowHour: clock.hour,
    nowMinute: clock.minute,
    isWorkingDay: isWorkingDay(clock.date, holidays),
    hasSubmittedToday,
  });

  return NextResponse.json({
    show,
    // jam mulai dalam bentuk siap tampil, hanya bila memang perlu ditampilkan.
    scheduleLabel: show
      ? `${String(setting.hour).padStart(2, "0")}:${String(
          setting.minute,
        ).padStart(2, "0")} WIB`
      : null,
  });
}

/**
 * PUT, simpan setelan pengingat. KHUSUS ADMIN.
 *
 * Body: { isEnabled: boolean, hour: number|string, minute: number|string }.
 * Validasi lewat `validateReminderSettingInput` (murni, teruji) supaya aturan
 * sama dengan yang diuji dan tidak diduplikasi.
 */
export async function PUT(request: Request) {
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) {
    return NextResponse.json({ error: "Belum masuk" }, { status: 401 });
  }
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!isAdminRole(role)) {
    return NextResponse.json(
      { error: "Hanya admin yang boleh mengatur pengingat absen." },
      { status: 403 },
    );
  }

  const gate = await enforceRateLimit(
    "adminUserAction",
    rateLimitKey("adminUserAction", actorId),
  );
  if (!gate.decision.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak aksi. Coba lagi dalam ${Math.ceil(
          gate.decision.retryAfterSeconds / 60,
        )} menit.`,
      },
      { status: 429, headers: gate.headers },
    );
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

  const raw = (body ?? {}) as {
    isEnabled?: unknown;
    hour?: unknown;
    minute?: unknown;
  };
  const parsed = validateReminderSettingInput(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, field: parsed.field },
      { status: 400 },
    );
  }

  const saved = await saveReminderSetting(parsed.setting);
  return NextResponse.json({ ok: true, setting: saved });
}
