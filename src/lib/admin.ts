// src/lib/admin.ts — logika tampilan halaman admin (murni, tanpa DB/jaringan).
//
// Tujuan: halaman admin (src/app/(app)/admin/page.tsx) menampilkan
// daftar pengguna + audit lintas pengguna. Keputusan yang bisa diuji (format
// ringkasan, penyaringan role, pemetaan status kredensial) dikumpulkan di sini
// supaya tidak perlu DB untuk mengujinya — pola sama seperti audit-log.ts.
//
// Catatan keamanan (SPEC.md §4): modul ini TIDAK menentukan siapa yang boleh
// masuk. Penjagaan ADMIN dilakukan di server (halaman + layout) lewat
// pemeriksaan `role !== "ADMIN"`. Di sini hanya ada fungsi murni presentasi.
//
// Tidak ada rahasia di sini: hanya email, nama, role, status, dan hitungan.

import type { CredentialStatus } from "@/generated/prisma/enums";

/** Apakah sebuah peran berhak membuka halaman admin. Selalu peka huruf besar-kecil. */
export function isAdminRole(role: string | null | undefined): boolean {
  return (role ?? "USER").toUpperCase() === "ADMIN";
}

/** Label manusia untuk status kredensial Monev pengguna. */
export function describeCredentialStatus(
  status: CredentialStatus | null | undefined,
): string {
  switch (status) {
    case "ACTIVE":
      return "Aktif";
    case "INVALID":
      return "Perlu diperbarui";
    case "UNVERIFIED":
      return "Belum diuji";
    default:
      return "Belum diisi";
  }
}

/**
 * Nada warna untuk status kredensial, dipetakan ke kelas Tailwind oleh halaman.
 * "good" = hijau, "bad" = merah/menonjol, "neutral" = abu-abu.
 */
export type Tone = "good" | "bad" | "neutral";

export function credentialStatusTone(
  status: CredentialStatus | null | undefined,
): Tone {
  switch (status) {
    case "ACTIVE":
      return "good";
    case "INVALID":
      return "bad";
    default:
      return "neutral";
  }
}

/** Ringkas data pengguna untuk kolom tabel admin. */
export interface AdminUserRow {
  email: string;
  name: string | null;
  role: string;
  credentialStatus: CredentialStatus | null;
  hasTemplate: boolean;
  automationEnabled: boolean;
  reportCount: number;
  submitCount: number;
  /** Waktu submit terakhir (ms), atau null bila belum pernah submit. */
  lastSubmitAt: Date | null;
}

export interface AdminSummary {
  totalUsers: number;
  admins: number;
  credentialActive: number;
  automationEnabled: number;
  /** Jumlah pengguna yang pernah submit minimal sekali. */
  everSubmitted: number;
}

/**
 * Hitung ringkasan lintas pengguna. MURNI. Daftar kosong → semua nol (bukan
 * NaN). `everSubmitted` menghitung pengguna (bukan log), jadi tidak mungkin
 * melebihi `totalUsers`.
 */
export function summarizeUsers(rows: readonly AdminUserRow[]): AdminSummary {
  let admins = 0;
  let credentialActive = 0;
  let automationEnabled = 0;
  let everSubmitted = 0;

  for (const row of rows) {
    if (isAdminRole(row.role)) admins += 1;
    if (row.credentialStatus === "ACTIVE") credentialActive += 1;
    if (row.automationEnabled) automationEnabled += 1;
    if (row.submitCount > 0) everSubmitted += 1;
  }

  return {
    totalUsers: rows.length,
    admins,
    credentialActive,
    automationEnabled,
    everSubmitted,
  };
}

/** Format tanggal bergabung ke zona Asia/Jakarta, eksplisit (bukan zona server). */
export function formatJoinDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`;
}

/** Inisial untuk avatar teks: dari nama bila ada, jika tidak dari email. */
export function initialsFor(row: Pick<AdminUserRow, "email" | "name">): string {
  const source = (row.name ?? "").trim() || row.email.trim();
  if (!source) return "?";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && row.name) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
