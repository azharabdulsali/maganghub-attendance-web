// src/lib/monev-submit.ts: KERANGKA pengiriman laporan ke portal Monev.
//
// ⚠️  STATUS: BELUM FINAL, menunggu bentuk endpoint submit (docs/MONEV-API.md §8).
//
// File ini dibangun SEBELUM §8 diketahui, sengaja, supaya struktur, validasi,
// penafsiran respons, dan tesnya sudah siap. Yang belum pasti HANYA nama-nama
// field body, semuanya dikumpulkan di satu blok `TODO §8` di bawah. Saat Anda
// merekam "Simpan dan Kirim" sekali (via /dev-tools atau Copy as
// cURL), cukup ganti nilai di blok itu; sisa file tidak perlu diubah.
//
// Batas etika: modul ini TIDAK PERNAH dipanggil selama fase uji koneksi.
// Ia hanya "hidup" saat orang benar-benar menekan tombol kirim, dan hanya
// setelah policy (report-policy.ts) mengizinkan.

import {
  MONEV_API_BASE,
  MONEV_FRONTEND_ORIGIN,
  fetchBuildId,
} from "./monev-client";

// ---------------------------------------------------------------------------
// Endpoint submit, ✅ TERVERIFIKASI dari rekaman cURL (docs/MONEV-API.md §8.1)
// ---------------------------------------------------------------------------
//
// Ditemukan 2026-09-28 dari "Copy as cURL" (submit + daily-logs + attendances).
// Nilai di bawah sudah bukan tebakan lagi.
//
// Catatan penting dari rekaman:
//   - Submit butuh header `authorization: Bearer <access token>` (ttl 6 jam),
//     BUKAN `monev_refresh_token` langsung. Access token harus ditukar dulu
//     (kemungkinan lewat /auth/refresh, bentuk body 200-nya masih dicari).
//   - "Kehadiran Hadir" dikirim sebagai field `status` = "PRESENT" (enum),
//     bukan `attendance: "1"` seperti dugaan awal (SPEC §11B, §12.7.2).
//
export const SUBMIT_ENDPOINT = {
  method: "POST" as const,
  path: "/api/v1/attendances/with-daily-log",
  bodyKind: "json" as const,
} as const;

/** Nama field body submit, persis dari rekaman (§8.1). */
export const FIELD_NAMES = {
  activity: "activity_log",
  learning: "lesson_learned",
  obstacles: "obstacles",
  /** Field kehadiran, WAJIB ada, kalau tidak laporan tercatat "Tidak Hadir"
   *  (SPEC.md §11B, MONEV-API §12.7.2). Nilai "Hadir" = "PRESENT". */
  attendance: "status",
  /** Tanggal target (YYYY-MM-DD), pengirim harus menyebut tanggal yang DIMINTA,
   *  bukan "hari ini" (SPEC.md §11B, MONEV-API §12.7.3). */
  date: "date",
} as const;

/** Nilai "Hadir" di field `status` (rekaman §8.1: enum PRESENT). */
export const ATTENDANCE_PRESENT = "PRESENT";

/** Endpoint baca status (RB-03 cek duplikasi & RB-06 verifikasi), §8.2, §8.3. */
export const READ_ENDPOINTS = {
  dailyLogs: "/api/v1/daily-logs",
  attendances: "/api/v1/attendances",
  /** Profil/home, untuk uji sesi alternatif dengan Bearer (§4.5). */
  home: "/api/v1/users/me/home",
} as const;

/** Endpoint tukar refresh → access. Bentuk respons 200-nya BELUM terekam (§4.4). */
export const REFRESH_ENDPOINT = "/api/v1/auth/refresh";

/** Kode HTTP sukses. ⚠️ Belum terverifikasi dari rekaman, amati saat uji. */
const HTTP_SUCCESS_CODES = new Set([200, 201]);

/** Kode "laporan sudah ada". ✅ TERVERIFIKASI (2026-09-28): portal membalas
 *  `409 Conflict` saat tanggal tsb sudah ada, terlihat di Riwayat
 *  (`HTTP 409` + status `DUPLICATE`). Rekaman: docs/MONEV-API.md §8.7. */
const HTTP_ALREADY_EXISTS = 409;
// ---------------------------------------------------------------------------

/** Isi laporan yang akan dikirim. */
export type ReportPayload = {
  activity: string;
  learning: string;
  obstacles: string;
  /** Tanggal target `YYYY-MM-DD` (dalam zona Jakarta). */
  date: string;
};

/** Hasil satu percobaan submit. Samakan dengan status hasil bot lama (§11B). */
export type SubmitResult =
  | { status: "SUCCESS"; httpCode: number; raw?: unknown }
  | { status: "ALREADY_SUBMITTED"; httpCode: number; message?: string }
  | { status: "ERROR"; httpCode?: number; message: string };

const MONEV_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

// Batas tunggu satu permintaan jaringan ke portal (build-id / submit).
//
// Kenapa 8s, bukan 15s: satu eksekusi cron bisa menembak DUA permintaan
// berurutan (fetchBuildId lalu submit), jadi durasi terburuk ≈ 2 × timeout.
// Dengan 15s, eksekusi yang macet (portal Monev down) bisa menggantung ~30s,
// dan melar lagi bila cron eksternal (cron-job.org) mengulang pada tenggat
// yang sama (buruk untuk kuota CPU Hobby & antrean user lain). 8s cukup untuk
// portal normal Indonesia dan menahan kasus buruk tetap di bawah ~16s.
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Susun body permintaan dari isi laporan. MURNI, tidak menyentuh jaringan,
 * sehingga bisa diuji tanpa efek samping.
 *
 * Field kehadiran SELALU disertakan (SPEC.md §11B): kalau lupa, laporan bisa
 * tercatat "Tidak Hadir".
 */
export function buildSubmitBody(
  payload: ReportPayload,
  kind: "json" | "form" = SUBMIT_ENDPOINT.bodyKind,
): { body: string; contentType: string } {
  const fields: Record<string, string> = {
    [FIELD_NAMES.activity]: payload.activity,
    [FIELD_NAMES.learning]: payload.learning,
    [FIELD_NAMES.obstacles]: payload.obstacles,
    [FIELD_NAMES.attendance]: ATTENDANCE_PRESENT,
    [FIELD_NAMES.date]: payload.date,
  };

  if (kind === "form") {
    return {
      body: new URLSearchParams(fields).toString(),
      contentType: "application/x-www-form-urlencoded",
    };
  }
  return {
    body: JSON.stringify(fields),
    contentType: "application/json",
  };
}

/**
 * Ambil pesan manusia dari body respons portal, bila ada. MURNI.
 *
 * Portal Monev bisa membalas JSON (`{"message": "..."}`, kadang dibungkus
 * `{"data": {...}}`) atau teks polos. Fungsi ini mencoba bentuk-bentuk umum dan
 * mengembalikan `undefined` bila tak ada yang layak, pemanggil memakai teks
 * cadangannya sendiri. Selalu batasi panjang supaya log tak memuat body besar.
 */
function extractMessage(bodyText: string): string | undefined {
  const trimmed = bodyText.trim();
  if (trimmed.length === 0) return undefined;

  const tryObj = (o: unknown): string | undefined => {
    if (!o || typeof o !== "object") return undefined;
    const rec = o as Record<string, unknown>;
    for (const key of ["message", "error", "detail"]) {
      const v = rec[key];
      if (typeof v === "string" && v.trim().length > 0) {
        return v.trim().slice(0, 300);
      }
    }
    return tryObj(rec.data);
  };

  try {
    const parsed = JSON.parse(trimmed);
    return tryObj(parsed) ?? undefined;
  } catch {
    // Bukan JSON: pakai teks polos bila cukup pendek & bukan tag HTML.
    if (trimmed.length <= 300 && !trimmed.startsWith("<")) return trimmed;
    return undefined;
  }
}

/**
 * Tafsirkan respons HTTP menjadi SubmitResult. MURNI, dipisah dari jaringan
 * supaya bisa diuji dengan angka status saja.
 *
 * Penting (RB-06, SPEC.md §11B): HTTP 2xx BUKAN bukti final bahwa laporan
 * tersimpan. Fungsi ini hanya menandai "permintaan diterima"; pemanggil WAJIB
 * menindaklanjuti dengan pengecekan status tersimpan sebelum mengklaim sukses
 * di audit log.
 */
export function interpretSubmitResponse(
  httpCode: number,
  bodyText: string,
): SubmitResult {
  if (HTTP_SUCCESS_CODES.has(httpCode)) {
    let raw: unknown;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      raw = bodyText;
    }
    return { status: "SUCCESS", httpCode, raw };
  }
  if (httpCode === HTTP_ALREADY_EXISTS) {
    // Pakai pesan portal bila ada (lebih informatif untuk audit log); jatuh ke
    // teks kita sendiri bila portal tidak menyertakan body yang bisa dibaca.
    const fromPortal = extractMessage(bodyText);
    return {
      status: "ALREADY_SUBMITTED",
      httpCode,
      message: fromPortal ?? "Laporan untuk tanggal ini sudah ada di portal.",
    };
  }
  return {
    status: "ERROR",
    httpCode,
    message: `Portal menolak dengan HTTP ${httpCode}.`,
  };
}

/**
 * Kirim satu laporan ke portal.
 *
 * ⚠️  Fungsi ini menembak jaringan KE PORTAL MONEV. Jangan panggil dari tes,
 * dan jangan panggil selama fase uji koneksi. Pemanggil di route WAJIB sudah
 * memeriksa `decide()` (report-policy) dan keberadaan token lebih dulu.
 *
 * ⚠️  Dari rekaman (§8.1), endpoint ini memerlukan header
 * `authorization: Bearer <access token>`, BUKAN `monev_refresh_token`
 * langsung. `accessToken` di sini adalah JWT akses (ttl 6 jam) yang harus
 * ditukar lebih dulu dari refresh token (lihat docs/MONEV-API.md §8.4).
 * Kewajiban penukaran ada di pemanggil, bukan di sini, supaya fungsi ini tetap
 * satu tanggung jawab: kirim laporan.
 *
 * @param accessToken JWT akses (Bearer), hasil penukaran refresh token.
 */
export async function submitReport(
  accessToken: string,
  payload: ReportPayload,
  options?: { buildId?: string; timeoutMs?: number },
): Promise<SubmitResult> {
  if (!accessToken || accessToken.trim().length === 0) {
    return { status: "ERROR", message: "Token akses kosong, hubungkan ulang." };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const buildId = options?.buildId ?? (await fetchBuildId({ timeoutMs }));
    const { body, contentType } = buildSubmitBody(payload);

    const res = await fetch(`${MONEV_API_BASE}${SUBMIT_ENDPOINT.path}`, {
      method: SUBMIT_ENDPOINT.method,
      headers: {
        Origin: MONEV_FRONTEND_ORIGIN,
        "User-Agent": MONEV_USER_AGENT,
        "x-frontend-build-id": buildId,
        accept: "application/json, */*",
        "content-type": contentType,
        // Bearer akses, bukan cookie refresh (§8.1).
        authorization: `Bearer ${accessToken}`,
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    return interpretSubmitResponse(res.status, text);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Waktu kirim ke portal habis."
        : "Tidak dapat menghubungi portal Monev saat mengirim.";
    return { status: "ERROR", message };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Cek duplikasi (RB-03), `GET /api/v1/daily-logs` — SPEC.md §11B, MONEV-API §8.2
// ---------------------------------------------------------------------------
//
// KENAPA ini ada: portal Monev TIDAK menolak submit ulang untuk tanggal yang
// sudah diisi lewat UI portal (jalur manual pengguna). Ia hanya membalas `409`
// bila ENDPOINT API ini dipanggil dua kali. Akibatnya, kalau kita mengandalkan
// `409` saja, cron bisa MENIMPA laporan yang sudah diisi manual — kejadian nyata
// terlihat di audit (laporan manual 18:00 tertimpa cron 18:52).
//
// Aturan tegas dari MONEV-API §12.6:
//   "fitur submit web WAJIB memeriksa status hari ini lebih dulu dan berhenti
//    bila sudah ada."
//
// Bot Python lama pun masih berjalan di produksi, jadi pra-cek ini melindungi
// dari tabrakan lintas-sistem.

/** Hasil pra-cek keberadaan daily-log untuk satu tanggal. */
export type DailyLogPresence =
  /** Pasti sudah ada → batalkan, jangan tembak submit. */
  | { status: "EXISTS" }
  /** Dipastikan belum ada → aman melanjutkan. */
  | { status: "ABSENT" }
  /**
   * Tidak bisa dipastikan (jaringan mati, 401/403, bentuk respons tak dikenal).
   * Pemanggil MEMUTUSKAN: default aman = batalkan. Lihat `duplicateGuardAllows`.
   */
  | { status: "UNKNOWN"; message: string };

/** Ambil array item dari beragam bentuk amplop respons portal. MURNI. */
function extractList(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  for (const key of ["data", "items", "results", "daily_logs", "dailyLogs"]) {
    const v = rec[key];
    if (Array.isArray(v)) return v;
    // `data` kadang membungkus lagi: { data: { items: [...] } }
    if (v && typeof v === "object") {
      const inner = v as Record<string, unknown>;
      for (const k2 of ["items", "results", "data"]) {
        if (Array.isArray(inner[k2])) return inner[k2] as unknown[];
      }
    }
  }
  return null;
}

/**
 * Tafsirkan respons daily-logs: apakah daftar berisi log untuk `date`? MURNI.
 *
 * Dipisah dari jaringan supaya bisa diuji tanpa fetch. Bentuk respons portal
 * belum terekam sempurna (§8.2/§8.4), jadi fungsi ini toleran.
 *
 * Aturan penting (§12.7.3, bug laten bot lama): cocokkan TANGGAL TARGET, jangan
 * sekadar "ada log". Portal bisa mengembalikan log untuk tanggal lain.
 */
export function interpretDailyLogs(
  httpCode: number,
  bodyText: string,
  targetDate: string,
): DailyLogPresence {
  if (httpCode === 401 || httpCode === 403) {
    return {
      status: "UNKNOWN",
      message: "Sesi Monev tidak berwenang untuk cek laporan.",
    };
  }
  if (httpCode < 200 || httpCode >= 300) {
    return {
      status: "UNKNOWN",
      message: `Portal membalas HTTP ${httpCode} saat cek laporan.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { status: "UNKNOWN", message: "Respons cek laporan bukan JSON." };
  }

  const list = extractList(parsed);
  if (list === null) {
    return { status: "UNKNOWN", message: "Bentuk respons cek laporan tidak dikenal." };
  }

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    for (const key of ["date", "log_date", "daily_log_date"]) {
      const v = rec[key];
      if (typeof v === "string" && v.slice(0, 10) === targetDate) {
        return { status: "EXISTS" };
      }
    }
  }
  return { status: "ABSENT" };
}

/**
 * Putuskan boleh-kirim berdasarkan hasil pra-cek. MURNI.
 *
 * Kebijakan default: HANYA `ABSENT` yang mengizinkan kirim. `EXISTS` jelas
 * membatalkan; `UNKNOWN` juga membatalkan — lebih baik melewatkan sehari
 * daripada menimpa laporan yang sudah ada (laporan besok tetap bisa dikirim).
 */
export function duplicateGuardAllows(presence: DailyLogPresence): boolean {
  return presence.status === "ABSENT";
}

/**
 * Tembak `GET /api/v1/daily-logs?date=<target>`. **Menembak jaringan**.
 *
 * Bentuk amplop responsnya belum sepenuhnya terekam, jadi penafsiran diserahkan
 * ke `interpretDailyLogs` yang toleran. Kegagalan apa pun → `UNKNOWN`, BUKAN
 * `ABSENT`: jangan pernah melanjutkan kirim hanya karena cek-nya gagal — itu
 * justru jalan menuju penimpaan.
 */
export async function checkDailyLogExists(
  accessToken: string,
  targetDate: string,
  options?: { buildId?: string; timeoutMs?: number },
): Promise<DailyLogPresence> {
  if (!accessToken || accessToken.trim().length === 0) {
    return { status: "UNKNOWN", message: "Token akses kosong saat cek laporan." };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const buildId = options?.buildId ?? (await fetchBuildId({ timeoutMs }));
    const url =
      `${MONEV_API_BASE}${READ_ENDPOINTS.dailyLogs}` +
      `?date=${encodeURIComponent(targetDate)}&limit=100`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Origin: MONEV_FRONTEND_ORIGIN,
        "User-Agent": MONEV_USER_AGENT,
        "x-frontend-build-id": buildId,
        accept: "application/json, */*",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    return interpretDailyLogs(res.status, text, targetDate);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Waktu cek laporan ke portal habis."
        : "Tidak dapat menghubungi portal Monev saat cek laporan.";
    return { status: "UNKNOWN", message };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Penukaran refresh token → access token (§4.4)
// ---------------------------------------------------------------------------

/** Hasil percobaan menukar refresh token menjadi access token. */
export type TokenExchangeResult =
  | { status: "OK"; accessToken: string; httpCode: number }
  | { status: "SESSION_DEAD"; httpCode: number; message: string }
  | { status: "ERROR"; httpCode?: number; message: string };

/**
 * Tafsirkan respons `POST /api/v1/auth/refresh`, MURNI, tanpa jaringan.
 *
 * ⚠️  Bentuk respons sukses (`200`) BELUM terekam (§4.4). Karena itu fungsi ini
 * sengaja **toleran dua kemungkinan**: access token bisa datang di body JSON
 * (`access_token` / `accessToken` / `token`) atau di header `set-cookie`
 * (cookie access terpisah). Bila tak satu pun ditemukan, hasilnya `ERROR`
 * dengan pesan jujur, bukan menebak.
 *
 * `401` (penanda sesi mati yang sudah terverifikasi, §4.1) dipetakan ke
 * `SESSION_DEAD` supaya pemanggil tahu harus minta login ulang, bukan sekadar
 * menandai error umum.
 */
export function interpretRefreshResponse(
  httpCode: number,
  bodyText: string,
  setCookieHeaders?: string[],
): TokenExchangeResult {
  if (httpCode === 401) {
    return {
      status: "SESSION_DEAD",
      httpCode,
      message: "Sesi masuk tidak tersedia atau tidak valid. Silakan masuk kembali.",
    };
  }
  if (!HTTP_SUCCESS_CODES.has(httpCode)) {
    return {
      status: "ERROR",
      httpCode,
      message: `Penukaran token ditolak dengan HTTP ${httpCode}.`,
    };
  }

  // Kemungkinan 1: access token ada di body JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = undefined;
  }
  if (parsed && typeof parsed === "object") {
    const rec = parsed as Record<string, unknown>;
    for (const key of ["access_token", "accessToken", "token"]) {
      const v = rec[key];
      if (typeof v === "string" && v.length > 0) {
        return { status: "OK", accessToken: v, httpCode };
      }
    }
    // Beberapa API membungkus di dalam `data`.
    const data = rec.data;
    if (data && typeof data === "object") {
      const inner = data as Record<string, unknown>;
      for (const key of ["access_token", "accessToken", "token"]) {
        const v = inner[key];
        if (typeof v === "string" && v.length > 0) {
          return { status: "OK", accessToken: v, httpCode };
        }
      }
    }
  }

  // Kemungkinan 2: access token muncul sebagai cookie di set-cookie.
  if (setCookieHeaders && setCookieHeaders.length > 0) {
    for (const raw of setCookieHeaders) {
      const m = /(?:^|;\s*)([^=;]+)=([^;]+)/.exec(raw);
      if (!m) continue;
      const name = m[1].trim();
      const value = m[2].trim();
      // Hanya ambil cookie yang jelas access (bukan refresh/hapus).
      if (
        value.length > 0 &&
        /access/i.test(name) &&
        !/refresh/i.test(name)
      ) {
        return { status: "OK", accessToken: value, httpCode };
      }
    }
  }

  return {
    status: "ERROR",
    httpCode,
    message:
      "Respons 200 diterima, tapi access token tidak ditemukan di bentuk yang " +
      "dikenal. Bentuk respons perlu direkam ulang (docs/MONEV-API.md §4.4).",
  };
}

/**
 * Tukar refresh token menjadi access token. **Menembak jaringan** ke portal.
 *
 * ⚠️  Belum pernah dijalankan. Karena bentuk respons 200 belum terekam,
 * fungsi ini hanya "mengikuti" respons apa adanya dan menyerahkan penafsiran
 * ke `interpretRefreshResponse`. Jangan panggil dari tes; jangan panggil selama
 * fase uji koneksi.
 *
 * @param refreshToken Nilai cookie `monev_refresh_token` (JWT, ttl 30 hari).
 */
export async function exchangeRefreshForAccess(
  refreshToken: string,
  options?: { buildId?: string; timeoutMs?: number },
): Promise<TokenExchangeResult> {
  if (!refreshToken || refreshToken.trim().length === 0) {
    return { status: "ERROR", message: "Refresh token kosong." };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const buildId = options?.buildId ?? (await fetchBuildId({ timeoutMs }));
    const res = await fetch(`${MONEV_API_BASE}${REFRESH_ENDPOINT}`, {
      method: "POST",
      headers: {
        Origin: MONEV_FRONTEND_ORIGIN,
        "User-Agent": MONEV_USER_AGENT,
        "x-frontend-build-id": buildId,
        accept: "application/json, */*",
        "content-length": "0",
        // Refresh token dikirim sebagai cookie, bukan Bearer (§4.1).
        cookie: `monev_refresh_token=${refreshToken}`,
      },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [];
    return interpretRefreshResponse(res.status, text, setCookies);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Waktu penukaran token habis."
        : "Tidak dapat menghubungi portal Monev saat menukar token.";
    return { status: "ERROR", message };
  } finally {
    clearTimeout(timer);
  }
}
