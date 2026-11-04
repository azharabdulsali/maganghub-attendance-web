// src/lib/git-repo-service.ts: logika bersama untuk fitur repo git.
//
// KENAPA ADA LAPISAN INI
// ----------------------
// Rute (`/api/repos`, `/api/repos/preview`) dan penyusun draf butuh perilaku
// yang SAMA: dekripsi token, ambil commit, sanitasi galat. Kalau logika ini
// ditulis di dalam `route.ts`, ia hanya bisa dites lewat HTTP dan gampang
// menyimpang antar-rute.
//
// ATURAN YANG DIJAGA (docs/GIT-COMMITS-PLAN.md §4, §6, §9)
// -------------------------------------------------------
// 1. **Token tidak pernah keluar dari modul ini.** `resolveCommits` hanya
//    mengembalikan commit; `toRepoView` hanya Boolean `hasToken`.
// 2. **Kegagalan git TIDAK PERNAH melempar.** Semua galat ditangkap dan diubah
//    menjadi `{ ok: false, message }` yang aman, supaya halaman laporan tetap
//    bisa dipakai walau GitHub sedang down.
// 3. **`lastError` disanitasi sebelum disimpan.** Pesan dari `GitApiError`
//    sudah aman; yang TIDAK boleh adalah menyimpan objek error mentah.

import { prisma } from "./prisma";
import { decrypt, encrypt } from "./crypto";
import { todayInJakarta } from "./submit-service";
import {
  commitsToKeywords,
  jakartaDayRange,
  type GitCommit,
} from "./git-commits";
import {
  fetchCommits,
  GitApiError,
  PREVIEW_LIMIT,
  type GitProviderName,
} from "./git-provider";

/** True bila fitur dimatikan operator lewat env (kill switch global). */
export function gitCommitsEnabled(): boolean {
  // Default AKTIF bila env kosong: fitur tetap opt-in per pengguna lewat
  // `GitRepoConfig` + toggle di /automation, jadi env ini hanya jaring darurat.
  const raw = process.env.GIT_COMMITS_ENABLED?.trim().toLowerCase();
  if (raw === undefined || raw === "") return true;
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Bentuk aman untuk dikirim ke klien. Tidak ada token di sini. */
export interface GitRepoView {
  exists: boolean;
  provider?: GitProviderName;
  repoPath?: string;
  branch?: string;
  enabled?: boolean;
  hasToken: boolean;
  lastFetchedAt?: string | null;
  lastError?: string | null;
  updatedAt?: string;
}

/** Bentuk baris DB yang dibutuhkan `toRepoView`. */
export interface GitRepoRow {
  provider: GitProviderName;
  repoPath: string;
  branch: string;
  enabled: boolean;
  ciphertext: string;
  lastFetchedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
}

/** Ubah baris DB menjadi view aman. Kolom rahasia tidak ikut dikirim. */
export function toRepoView(row: GitRepoRow | null): GitRepoView {
  if (!row) return { exists: false, hasToken: false };
  return {
    exists: true,
    provider: row.provider,
    repoPath: row.repoPath,
    branch: row.branch,
    enabled: row.enabled,
    hasToken: Boolean(row.ciphertext),
    lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null,
    lastError: row.lastError,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Hasil pengambilan commit: selalu bisa ditampilkan, tidak pernah melempar. */
export type ResolveResult =
  | { ok: true; commits: GitCommit[]; keywords: string; date: string }
  | { ok: false; message: string; date: string };

/**
 * Ambil commit untuk satu hari (default: hari ini WIB).
 *
 * `userId` pemilik sesi. Fungsi ini yang membaca & mendekripsi token, jadi
 * satu-satunya tempat plaintext token menyentuh logika aplikasi.
 */
export async function resolveCommits(
  userId: string,
  date?: string,
): Promise<ResolveResult> {
  const hari = date?.trim() || todayInJakarta();

  if (!gitCommitsEnabled()) {
    return {
      ok: false,
      message:
        "Fitur commit git sedang dinonaktifkan oleh pengelola aplikasi. Isi laporan secara manual atau pakai template.",
      date: hari,
    };
  }

  const row = await prisma.gitRepoConfig.findUnique({ where: { userId } });
  if (!row) {
    return {
      ok: false,
      message: "Belum ada repo git yang terhubung. Atur dulu di halaman Repo Git.",
      date: hari,
    };
  }
  if (!row.enabled) {
    return {
      ok: false,
      message:
        "Repo git sedang dinonaktifkan. Aktifkan kembali di halaman Repo Git bila ingin memakai commit.",
      date: hari,
    };
  }

  let rentang: { sinceIso: string; untilIso: string };
  try {
    rentang = jakartaDayRange(hari);
  } catch {
    return { ok: false, message: "Tanggal tidak valid.", date: hari };
  }

  // `repoPath` berbentuk "owner/repo". Untuk GitLab, namespace boleh bertingkat
  // ("grup/subgrup/repo"), jadi yang menentukan adalah SEGMEN TERAKHIR = nama
  // repo, dan sisanya = owner/namespace. Versi lama mengambil segmen pertama
  // sebagai owner dan menggabungkan sisanya jadi repo -- itu menghasilkan
  // "Nama owner/repo tidak valid" untuk setiap repo GitLab bertingkat.
  //
  // GitHub hanya izinkan proyek di tingkat user/org (tanpa subgroup), jadi
  // lebih dari dua segmen di GitHub pasti kekeliruan pengguna; itu ditolak
  // terpisah supaya pesannya jelas, bukan diteruskan sebagai 404 dari API.
  const segmen = row.repoPath.split("/").filter((s) => s.length > 0);
  if (segmen.length < 2) {
    return {
      ok: false,
      message:
        'Jalur repo harus berbentuk "owner/nama-repo" (GitLab boleh "grup/subgrup/nama-repo").',
      date: hari,
    };
  }
  if (row.provider === "GITHUB" && segmen.length > 2) {
    return {
      ok: false,
      message:
        'GitHub tidak mendukung repo bertingkat. Isi dengan "owner/nama-repo" saja.',
      date: hari,
    };
  }
  const repo = segmen[segmen.length - 1];
  const owner = segmen.slice(0, -1).join("/");

  try {
    // Dekripsi bisa gagal bila ENCRYPTION_KEY berganti: itu galat yang harus
    // jelas bagi pengguna ("tempel ulang token"), bukan crash.
    let token: string;
    try {
      token = decrypt({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
      });
    } catch {
      return {
        ok: false,
        message:
          "Token tersimpan tidak bisa dibuka. Tempel ulang token di halaman Repo Git.",
        date: hari,
      };
    }

    const commits = await fetchCommits({
      provider: row.provider,
      owner,
      repo,
      token,
      sinceIso: rentang.sinceIso,
      untilIso: rentang.untilIso,
    });

    // Catat keberhasilan & bersihkan galat lama. Kegagalan mencatat status
    // TIDAK boleh menggagalkan permintaan (DB bisa sedang sibuk), jadi
    // `.catch` kosong di sini disengaja, bukan kelalaian.
    await prisma.gitRepoConfig
      .update({
        where: { userId },
        data: { lastFetchedAt: new Date(), lastError: null },
      })
      .catch(() => undefined);

    return { ok: true, commits, keywords: commitsToKeywords(commits), date: hari };
  } catch (err) {
    const message =
      err instanceof GitApiError
        ? err.message
        : "Gagal mengambil commit dari penyedia git.";

    // Simpan supaya pengguna melihat statusnya di halaman Repo Git, bukan
    // mengira fitur berfungsi padahal tokennya sudah mati.
    await prisma.gitRepoConfig
      .update({ where: { userId }, data: { lastError: message } })
      .catch(() => undefined);

    return { ok: false, message, date: hari };
  }
}

/** Ringkas daftar commit untuk UI: hanya field tampilan, tanpa isi mentah. */
export function toCommitView(commits: readonly GitCommit[]): Array<{
  shortId: string;
  title: string;
  author: string;
  committedAt: string;
  url?: string;
}> {
  return commits.slice(0, PREVIEW_LIMIT).map((c) => ({
    shortId: c.shortId,
    title: c.title,
    author: c.author,
    committedAt: c.committedAt,
    ...(c.url ? { url: c.url } : {}),
  }));
}

/**
 * Bahan `DraftInput` dari commit.
 *
 * Mengembalikan `null` bila tidak ada bahan yang layak (semua commit generik
 * atau tidak ada commit sama sekali). Pemanggil WAJIB memakai `null` sebagai
 * sinyal "jangan buat draf dari commit", bukan mengirim string kosong ke
 * penyusun — itu menghasilkan laporan palsu yang terlihat terisi.
 */
export function draftInputFromCommits(
  keywords: string,
): { keywords: string } | null {
  const bersih = (keywords ?? "").trim();
  if (!bersih) return null;
  return { keywords: bersih };
}

/**
 * Nyalakan/matikan pemakaian commit TANPA menyentuh token.
 *
 * Kenapa perlu fungsi sendiri, bukan lewat `saveRepoConfig`: menyimpan ulang
 * lewat form mewajibkan pengguna menempel token lagi (server tidak bisa
 * membacanya balik). Kalau mematikan fitur harus menempel token, orang akan
 * memilih menghapus repo saja. Sakelar ini hanya mengubah satu kolom.
 *
 * Mengembalikan `null` bila belum ada repo; pemanggil menerjemahkannya jadi 404.
 */
export async function setRepoEnabled(
  userId: string,
  enabled: boolean,
): Promise<{ enabled: boolean } | null> {
  const ada = await prisma.gitRepoConfig.findUnique({
    where: { userId },
    select: { userId: true },
  });
  if (!ada) return null;

  return prisma.gitRepoConfig.update({
    where: { userId },
    data: { enabled },
    select: { enabled: true },
  });
}

/** Simpan konfigurasi repo (buat atau ganti). Token dienkripsi di sini. */
export async function saveRepoConfig(
  userId: string,
  input: {
    provider: GitProviderName;
    repoPath: string;
    branch: string;
    token: string;
  },
): Promise<{ provider: GitProviderName; repoPath: string; branch: string }> {
  const { ciphertext, iv, authTag } = encrypt(input.token);

  // Ganti token = mulai bersih: `lastError` lama (mis. "token kedaluwarsa")
  // tidak relevan lagi untuk token yang baru ditempel.
  return prisma.gitRepoConfig.upsert({
    where: { userId },
    create: {
      userId,
      provider: input.provider,
      repoPath: input.repoPath,
      branch: input.branch,
      ciphertext,
      iv,
      authTag,
      enabled: true,
      lastError: null,
    },
    update: {
      provider: input.provider,
      repoPath: input.repoPath,
      branch: input.branch,
      ciphertext,
      iv,
      authTag,
      enabled: true,
      lastError: null,
    },
    select: { provider: true, repoPath: true, branch: true },
  });
}
