// src/lib/work-schedule-repo.ts: akses DB untuk jadwal kerja mingguan.
//
// Ini SATU-SATUNYA jalur runtime yang membaca/menulis tabel `work_schedules`.
// Karena modul ini menyentuh Prisma, ia SERVER-ONLY: JANGAN impor dari
// komponen klien (form Jadwal Kerja menerima daftar hari sebagai prop/data,
// pola sama dengan holidays-repo.ts).
//
// GAGAL-LUNAK (penting): jadwal kerja adalah PENYEMPURNAAN kebijakan, bukan
// syarat pengiriman. Bila tabel belum ada (mis. `db push` belum dijalankan
// setelah deploy) atau DB error sesaat, pembacaan jatuh ke DEFAULT Senin–Jumat
// — bukan melempar. Tanpa pagar ini, satu fitur pelengkap bisa mematikan
// seluruh otomasi (manual, cron, dispatcher) bila tabelnya bermasalah. Jalur
// simpan (`saveWorkSchedule`) TIDAK gagal-lunak: bila penyimpanan ditolak,
// pengguna harus tahu (route yang melempar pesan ramah), bukan diam-diam
// "tersimpan" padahal tidak.

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_WORK_DAYS,
  normalizeWorkDays,
  type WorkDay,
  type WorkDays,
} from "@/lib/work-schedule";

/** Salinan array default baru setiap kali dikembalikan (jangan bagikan instansi). */
function defaultDays(): WorkDay[] {
  return [...DEFAULT_WORK_DAYS];
}

/** Hari kerja yang sudah dinormalisasi, atau default bila hasilnya kosong. */
function normalizedOrDefault(days: readonly unknown[]): WorkDay[] {
  const days2 = normalizeWorkDays(days);
  return days2.length > 0 ? days2 : defaultDays();
}

/**
 * Baca jadwal kerja satu pengguna. Tanpa baris → default Senin–Jumat; DB
 * bermasalah/tabel belum ada → default juga (gagal-lunak, lihat komentar atas).
 */
export async function loadWorkSchedule(userId: string): Promise<WorkDay[]> {
  return (await loadWorkScheduleState(userId)).days;
}

/**
 * Seperti `loadWorkSchedule`, tetapi sekaligus memberi tahu apakah barisnya
 * MEMANG ada. Dipakai form Jadwal Kerja: pengguna baru harus melihat centang
 * bawaan Senin–Jumat dengan keterangan "belum diatur", bukan seolah ia sudah
 * pernah memilih jadwal itu.
 */
export async function loadWorkScheduleState(
  userId: string,
): Promise<{ days: WorkDay[]; exists: boolean }> {
  try {
    const row = await prisma.workSchedule.findUnique({
      where: { userId },
      select: { days: true },
    });
    if (!row) return { days: defaultDays(), exists: false };
    return { days: normalizedOrDefault(row.days), exists: true };
  } catch {
    return { days: defaultDays(), exists: false };
  }
}

/**
 * Simpan jadwal kerja (upsert, satu baris per pengguna). `days` diasumsikan
 * sudah tervalidasi (skema Zod) — fungsi ini hanya merapikan lagi. Melempar
 * bila DB menolak: pemanggil (route) yang menerjemahkan jadi pesan ramah.
 */
export async function saveWorkSchedule(
  userId: string,
  days: WorkDays,
): Promise<WorkDay[]> {
  const normalized = normalizedOrDefault(days);
  const saved = await prisma.workSchedule.upsert({
    where: { userId },
    create: { userId, days: normalized },
    update: { days: normalized },
    select: { days: true },
  });
  return normalizedOrDefault(saved.days);
}
