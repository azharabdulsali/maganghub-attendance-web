// src/lib/git-provider.ts: klien BACA-SAJA ke GitHub & GitLab untuk mengambil
// commit hari ini.
//
// KENAPA TERPISAH DARI MODUL LAIN
// ------------------------------
// - `git-commits.ts` MURNI (tanpa jaringan). Berkas ini satu-satunya yang
//   melakukan `fetch`, sehingga jaringan mudah di-stub di tes.
// - Bentuk balasan GitHub dan GitLab berbeda jauh. Keduanya dinormalkan ke
//   `GitCommit` di sini, supaya pemanggil tidak peduli provider.
//
// KEAMANAN (docs/GIT-COMMITS-PLAN.md §6) — jangan dilonggarkan
// -----------------------------------------------------------
// 1. **URL TIDAK PERNAH dibangun dari input pengguna.** Base URL hanya berasal
//    dari `PROVIDER_ENDPOINT` yang dipetakan dari enum `GitProvider`. Pengguna
//    hanya menyuplai `owner` dan `repo`, yang divalidasi dengan pola ketat.
//    Ini menutup SSRF: tanpa ini, pengguna bisa memasukkan
//    `http://169.254.169.254/` sebagai "repo" dan memaksa server memanggilnya.
// 2. **Token tidak pernah ditulis ke log, pesan error, atau nilai balik.**
//    `GitApiError` hanya membawa status HTTP dan jenis kegagalan.
// 3. **Hanya GET.** Tidak ada metode tulis; scope token cukup read-only.
// 4. **Timeout wajib.** Tanpa `AbortSignal`, form laporan bisa ikut macet bila
//    GitHub lambat.

import type { GitCommit } from "./git-commits";

/** Provider yang didukung. Harus sinkron dengan enum `GitProvider` di Prisma. */
export type GitProviderName = "GITHUB" | "GITLAB";

/** Timeout satu permintaan ke API git (ms). */
const TIMEOUT_MS = 10_000;

/**
 * Base URL API per provider. **Satu-satunya** sumber host yang boleh dipanggil.
 * Tidak ada jalur kode yang menambahkan host dari input pengguna.
 */
const PROVIDER_ENDPOINT: Record<GitProviderName, string> = {
  GITHUB: "https://api.github.com",
  GITLAB: "https://gitlab.com/api/v4",
};

/** Jenis kegagalan, dipetakan ke pesan ramah di UI. */
export type GitErrorKind =
  | "INVALID_REPO"
  | "AUTH"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "NETWORK"
  | "HTTP";

/** Error yang aman ditampilkan: tidak pernah memuat token. */
export class GitApiError extends Error {
  readonly kind: GitErrorKind;
  readonly status?: number;

  constructor(kind: GitErrorKind, message: string, status?: number) {
    super(message);
    this.name = "GitApiError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Pola nama owner/namespace dan repo.
 *
 * Sengaja ketat:
 * - GitHub owner: alfanumerik + `-`, tidak boleh diawali/diakhiri `-`.
 * - GitLab memakai namespace bertingkat (`grup/subgrup`), jadi `/` diizinkan
 *   tetapi TIDAK boleh di awal/akhir atau berulang (dicek terpisah).
 * - Titik hanya boleh di tengah (repo `foo.js` sah, `..` tidak).
 */
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/;
const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/**
 * Validasi `owner` + `repo` dan rakit jalur API.
 *
 * Mengembalikan jalur relatif. Melempar `GitApiError` bila tidak valid.
 * Dipisah & diekspor supaya bisa dites langsung tanpa jaringan.
 */
export function buildApiPath(
  provider: GitProviderName,
  owner: string,
  repo: string,
): string {
  const o = (owner ?? "").trim();
  const r = (repo ?? "").trim();

  if (!o || !r) {
    throw new GitApiError("INVALID_REPO", "Owner dan nama repo wajib diisi.");
  }
  if (o.length > 200 || r.length > 200) {
    throw new GitApiError("INVALID_REPO", "Owner atau nama repo terlalu panjang.");
  }

  // Tolak `/` ganda dan segmen `..` secara eksplisit sebelum regex. Regex saja
  // bisa lolos untuk kasus tepi; pemeriksaan ini lebih mudah dibaca & dites.
  if (
    o.includes("//") ||
    r.includes("//") ||
    o.includes("..") ||
    r.includes("..")
  ) {
    throw new GitApiError("INVALID_REPO", "Nama owner/repo tidak valid.");
  }
  if (!OWNER_PATTERN.test(o) || !REPO_PATTERN.test(r)) {
    throw new GitApiError("INVALID_REPO", "Nama owner/repo tidak valid.");
  }
  if (r.includes("/")) {
    // Repo tidak boleh mengandung `/`; hanya owner/namespace yang boleh.
    // Pesan menyebut jalur utuh: bagi pengguna, "nama repo tidak boleh
    // mengandung /" tidak menjelaskan bagian mana yang salah.
    throw new GitApiError(
      "INVALID_REPO",
      `Jalur repo "${o}/${r}" tidak bisa dipakai. Untuk GitLab, tulis semuanya dalam satu kolom, mis. "grup/subgrup/nama-repo".`,
    );
  }

  // `encodeURIComponent` diterapkan PER SEGMEN, bukan pada seluruh jalur, agar
  // `/` di namespace GitLab tetap pemisah jalur (bukan di-encode jadi %2F).
  const ownerPath = o
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  switch (provider) {
    case "GITHUB":
      return `/repos/${ownerPath}/${encodeURIComponent(r)}/commits`;
    case "GITLAB":
      // GitLab perlu project path ter-encode utuh (%2F untuk namespace).
      return `/projects/${encodeURIComponent(`${o}/${r}`)}/repository/commits`;
    default: {
      // `never` memastikan penambahan provider baru tidak lolos diam-diam.
      const exhaustive: never = provider;
      throw new GitApiError(
        "INVALID_REPO",
        `Provider tidak dikenal: ${String(exhaustive)}`,
      );
    }
  }
}

/** Parameter pengambilan commit. */
export interface FetchCommitsOptions {
  provider: GitProviderName;
  owner: string;
  repo: string;
  /** Token read-only (PAT). Tidak pernah dicatat. */
  token: string;
  /** Batas awal waktu (ISO). Commit sebelum ini tidak diambil. */
  sinceIso: string;
  /** Batas akhir waktu (ISO), opsional. */
  untilIso?: string;
  /**
   * Branch yang dibaca. **Kosong = default branch repo** (bukan "main").
   *
   * KENAPA TIDAK `"main"` SAJA: banyak repo memakai `master`, `develop`, atau
   * nama lain. Tanpa parameter ini, API git memakai default branch repo — itu
   * perilaku yang benar. Menebak "main" justru menghasilkan 404 / daftar kosong
   * pada repo yang default-nya bukan main.
   */
  branch?: string;
  /** Jumlah maksimum commit. */
  perPage?: number;
}

/**
 * Pola nama branch yang boleh diteruskan ke query API.
 *
 * Branch masuk ke query string (`ref_name` / `sha`), jadi ia diperlakukan
 * sebagai data tak tepercaya seperti `owner`/`repo`. Pola ini mengikuti aturan
 * `git check-ref-format` secara ringkas: huruf/angka/titik/garis bawah/strip,
 * boleh bertingkat dengan `/`, tidak boleh diawali `-` (bisa disalahartikan
 * sebagai opsi), dan tidak boleh mengandung `..` atau `//`.
 */
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/**
 * Validasi nama branch opsional.
 *
 * Mengembalikan `null` bila branch kosong/tidak diisi — pemanggil lalu
 * membiarkan API memakai default branch repo. Melempar `GitApiError` bila
 * bentuknya tidak sah, supaya nilai aneh tidak pernah sampai ke query.
 */
export function normalizeBranch(branch: string | undefined | null): string | null {
  const b = (branch ?? "").trim();
  if (!b) return null;
  if (b.length > 200 || !BRANCH_PATTERN.test(b) || b.includes("..") || b.includes("//")) {
    throw new GitApiError(
      "INVALID_REPO",
      "Nama branch tidak valid. Contoh yang benar: main, dev-zar, atau feature/login.",
    );
  }
  return b;
}

/** Header per provider. Token HANYA masuk ke header, tidak ke URL. */
function headersFor(provider: GitProviderName, token: string): HeadersInit {
  const base: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "maganghub-attendance-web",
  };
  switch (provider) {
    case "GITHUB":
      // `Bearer` lebih modern daripada `token`; keduanya diterima GitHub.
      return { ...base, Authorization: `Bearer ${token}` };
    case "GITLAB":
      return { ...base, "PRIVATE-TOKEN": token };
  }
}

/** Petakan status HTTP ke `GitApiError` yang ramah dan aman. */
function errorForStatus(status: number): GitApiError {
  if (status === 401 || status === 403) {
    return new GitApiError(
      "AUTH",
      "Token ditolak atau tidak punya izin baca repo. Periksa token dan cakupannya.",
      status,
    );
  }
  if (status === 404) {
    return new GitApiError(
      "NOT_FOUND",
      "Repo tidak ditemukan, atau token tidak punya akses ke repo tersebut.",
      status,
    );
  }
  if (status === 429) {
    return new GitApiError(
      "RATE_LIMIT",
      "Batas permintaan ke penyedia git tercapai. Coba lagi beberapa saat lagi.",
      status,
    );
  }
  return new GitApiError("HTTP", `Penyedia git membalas error (${status}).`, status);
}

/**
 * Normalkan potongan balasan GitHub ke `GitCommit`.
 * Diekspor untuk tes langsung tanpa jaringan.
 */
export function normalizeGithubCommit(raw: unknown): GitCommit | null {
  const item = raw as {
    sha?: unknown;
    html_url?: unknown;
    commit?: {
      message?: unknown;
      author?: { name?: unknown; date?: unknown };
      committer?: { date?: unknown };
    };
  };
  const sha = typeof item?.sha === "string" ? item.sha : "";
  const message = item?.commit?.message;
  if (!sha || typeof message !== "string") return null;

  // Hanya baris pertama yang dipakai sebagai judul; sisanya jadi `body`.
  const [judulPertama = "", ...sisanya] = message.split("\n");
  const date = item.commit?.author?.date ?? item.commit?.committer?.date ?? "";

  return {
    shortId: sha.slice(0, 7),
    title: judulPertama.trim(),
    body: sisanya.join("\n").trim() || undefined,
    author:
      typeof item.commit?.author?.name === "string"
        ? item.commit.author.name
        : "tidak diketahui",
    committedAt: typeof date === "string" ? date : "",
    url: typeof item.html_url === "string" ? item.html_url : undefined,
  };
}

/**
 * Normalkan potongan balasan GitLab ke `GitCommit`.
 * Diekspor untuk tes langsung tanpa jaringan.
 */
export function normalizeGitlabCommit(raw: unknown): GitCommit | null {
  const item = raw as {
    id?: unknown;
    short_id?: unknown;
    title?: unknown;
    message?: unknown;
    author_name?: unknown;
    committed_date?: unknown;
    web_url?: unknown;
  };
  const id = typeof item?.id === "string" ? item.id : "";
  // GitLab memisahkan `title` (baris pertama) dan `message` (utuh).
  const title =
    typeof item?.title === "string"
      ? item.title
      : typeof item?.message === "string"
        ? item.message.split("\n")[0]
        : "";
  if (!id || !title) return null;

  const shortId =
    typeof item.short_id === "string" && item.short_id
      ? item.short_id
      : id.slice(0, 7);

  return {
    shortId: shortId.slice(0, 8),
    title: title.trim(),
    author:
      typeof item.author_name === "string" ? item.author_name : "tidak diketahui",
    committedAt:
      typeof item.committed_date === "string" ? item.committed_date : "",
    url: typeof item.web_url === "string" ? item.web_url : undefined,
  };
}

/** Batas atas jumlah commit yang ditampilkan di pratinjau. */
export const PREVIEW_LIMIT = 20;

/**
 * Ambil commit dalam rentang waktu tertentu.
 *
 * Melempar `GitApiError` untuk SEMUA kegagalan, termasuk jaringan putus.
 * Pemanggil WAJIB menangkapnya dan jatuh ke fallback lokal: kegagalan git tidak
 * boleh membuat form laporan ikut gagal.
 */
export async function fetchCommits(
  opts: FetchCommitsOptions,
): Promise<GitCommit[]> {
  const {
    provider,
    owner,
    repo,
    token,
    sinceIso,
    untilIso,
    branch,
    perPage = 50,
  } = opts;

  if (!token?.trim()) {
    throw new GitApiError("AUTH", "Token git belum diisi.");
  }

  // Divalidasi SEBELUM dipakai: nilai ini masuk query string.
  const ref = normalizeBranch(branch);

  const apiPath = buildApiPath(provider, owner, repo);
  const url = new URL(PROVIDER_ENDPOINT[provider] + apiPath);

  // Query dirakit lewat `URLSearchParams` (di-encode otomatis), bukan
  // interpolasi string, supaya nilai ISO yang aneh pun tidak merusak URL.
  url.searchParams.set("since", sinceIso);
  if (untilIso) url.searchParams.set("until", untilIso);
  // Nama parameter berbeda per provider:
  // - GitHub: `sha` (branch, tag, atau SHA — semuanya sah)
  // - GitLab: `ref_name` (branch atau tag)
  // Tanpa ini, API memakai DEFAULT BRANCH repo. Itu sebabnya commit di branch
  // kerja tidak pernah terlihat walau branch sudah tersimpan di DB.
  if (ref) {
    if (provider === "GITHUB") url.searchParams.set("sha", ref);
    else url.searchParams.set("ref_name", ref);
  }
  url.searchParams.set("per_page", String(perPage));

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: headersFor(provider, token),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // API git tidak butuh cookie; cegah kebocoran sesi bila kode jalan di
      // lingkungan yang sama dengan aplikasi.
      credentials: "omit",
    });
  } catch {
    // Pesan sengaja generik: error `fetch` bisa memuat URL, dan untuk GitLab
    // URL memuat path proyek. Token sendiri tidak ada di URL, tetapi lebih aman
    // tidak meneruskan detail apa pun.
    throw new GitApiError(
      "NETWORK",
      "Tidak bisa menghubungi penyedia git. Periksa koneksi, lalu coba lagi.",
    );
  }

  if (!res.ok) throw errorForStatus(res.status);

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new GitApiError("HTTP", "Balasan penyedia git tidak bisa dibaca.");
  }

  if (!Array.isArray(data)) {
    throw new GitApiError("HTTP", "Balasan penyedia git tidak sesuai bentuk.");
  }

  const normalizer =
    provider === "GITHUB" ? normalizeGithubCommit : normalizeGitlabCommit;

  return data.map(normalizer).filter((c): c is GitCommit => c !== null);
}
