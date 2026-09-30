// src/lib/har-capture.ts: menganalisis rekaman lalu lintas (HAR atau curl)
// untuk menemukan endpoint submit laporan (lihat docs/MONEV-API.md §8).
//
// KENAPA ADA: endpoint submit laporan belum diketahui. Satu-satunya cara
// etis untuk mengetahuinya adalah meminta pemilik akun menekan "Simpan dan
// Kirim" SEKALI di browsernya sendiri, lalu menyerahkan rekamannya ke sini.
// Modul ini TIDAK PERNAH mengirim apa pun ke jaringan, ia hanya membaca teks
// yang sudah direkam.
//
// KEAMANAN: modul ini sengaja menapis nilai rahasia (cookie, Authorization,
// token, password) sebelum mengembalikan hasil. Yang kita butuhkan hanyalah
// BENTUK permintaan (method, path, nama field), bukan isinya. Jangan pernah
// menampilkan nilai token mentah ke UI atau log.

/** Ringkasan satu permintaan yang relevan, sudah dibersihkan dari rahasia. */
export type CapturedRequest = {
  method: string;
 /** Hanya path (tanpa host) (mis. `/api/v1/report`) supaya aman ditampilkan. */
  path: string;
  /** Nama header yang dikirim (nilai tidak disertakan). */
  headerNames: string[];
  contentType: string | null;
  /** Nama field body saja, nilainya dibuang. */
  fieldNames: string[];
  /** Bentuk body: "json" | "form" | "multipart" | "unknown". */
  bodyKind: "json" | "form" | "multipart" | "unknown";
  /** Kode status respons yang terekam, bila ada. */
  responseStatus: number | null;
  /** Cuplikan respons (dipotong, sudah ditapis), untuk melihat pesan sukses. */
  responseSnippet: string | null;
};

export type CaptureAnalysis = {
  ok: boolean;
  /** Pesan ramah untuk ditampilkan ke pengguna. */
  message: string;
  /** Kandidat endpoint submit yang ditemukan. */
  candidates: CapturedRequest[];
};

const RAHASIA = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-csrf-token",
  "x-xsrf-token",
  "token",
  "password",
  "passwd",
  "secret",
];

/** Apakah nama header/field tergolong rahasia dan harus disamarkan? */
export function isSecretName(name: string): boolean {
  const n = name.toLowerCase();
  return RAHASIA.some((s) => n.includes(s));
}

/** Samarkan nilai rahasia agar tidak pernah bocor ke UI/log. */
export function redactValue(name: string, value: unknown): string {
  if (isSecretName(name)) return "«disamarkan»";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s == null) return "";
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

/** Ambil hanya nama field dari body JSON, nilainya dibuang. */
function fieldNamesFromJson(body: string): string[] {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed as Record<string, unknown>);
    }
    return [];
  } catch {
    return [];
  }
}

/** Ambil hanya nama field dari body form-encoded / multipart. */
function fieldNamesFromForm(body: string): string[] {
  const names = new Set<string>();
  for (const pair of body.split(/[&\r\n]/)) {
    const eq = pair.indexOf("=");
    const raw = eq >= 0 ? pair.slice(0, eq) : pair;
    const name = raw.replace(/^name="/, "").replace(/"$/, "").trim();
    if (name) names.add(name);
  }
  return [...names];
}

/** Tebak bentuk body dari header content-type. */
function bodyKindOf(
  contentType: string | null,
): "json" | "form" | "multipart" | "unknown" {
  if (!contentType) return "unknown";
  const ct = contentType.toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("multipart")) return "multipart";
  if (ct.includes("x-www-form-urlencoded")) return "form";
  return "unknown";
}

/** Apakah permintaan ini kandidat submit laporan? (POST ke API, bukan auth). */
export function isSubmitCandidate(method: string, path: string): boolean {
  if (!/^(post|put|patch)$/i.test(method)) return false;
  // Bukan endpoint auth/refresh/login, itu sudah kita pahami (§4).
  if (/\/auth\//i.test(path)) return false;
  // Harus berada di API Monev.
  if (!/^\/api\/v1\//i.test(path)) return false;
  return true;
}

/** Ubah URL apa pun menjadi path saja (buang query, buang host). */
function toPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    const q = url.indexOf("?");
    const p = q >= 0 ? url.slice(0, q) : url;
    return p.replace(/^https?:\/\/[^/]+/i, "") || p;
  }
}

type HarEntry = {
  request?: {
    method?: string;
    url?: string;
    headers?: { name?: string; value?: string }[];
    postData?: { mimeType?: string; text?: string };
  };
  response?: {
    status?: number;
    content?: { text?: string };
  };
};

/** Analisis berkas HAR (JSON hasil "Save all as HAR"). */
export function analyzeHar(raw: string): CaptureAnalysis {
  let parsed: { log?: { entries?: HarEntry[] } };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return {
      ok: false,
      message: "Teks ini bukan JSON HAR yang valid. Pastikan memilih “Export HAR”.",
      candidates: [],
    };
  }

  const entries = parsed.log?.entries;
  if (!Array.isArray(entries)) {
    return {
      ok: false,
      message: "Struktur HAR tidak dikenali (tidak ada log.entries).",
      candidates: [],
    };
  }

  const candidates: CapturedRequest[] = [];
  for (const entry of entries) {
    const req = entry.request;
    if (!req?.url) continue;
    const method = (req.method ?? "GET").toUpperCase();
    const path = toPath(req.url);
    if (!isSubmitCandidate(method, path)) continue;

    const headers = req.headers ?? [];
    const contentType =
      headers.find((h) => (h.name ?? "").toLowerCase() === "content-type")
        ?.value ?? req.postData?.mimeType ?? null;
    const kind = bodyKindOf(contentType);
    const bodyText = req.postData?.text ?? "";
    const fieldNames =
      kind === "json"
        ? fieldNamesFromJson(bodyText)
        : kind === "form" || kind === "multipart"
          ? fieldNamesFromForm(bodyText)
          : [];

    const respText = entry.response?.content?.text ?? null;
    const responseSnippet = respText
      ? respText.length > 300
        ? `${respText.slice(0, 300)}…`
        : respText
      : null;

    candidates.push({
      method,
      path,
      headerNames: headers
        .map((h) => h.name ?? "")
        .filter(Boolean)
        .filter((n) => !isSecretName(n)),
      contentType,
      fieldNames,
      bodyKind: kind,
      responseStatus: entry.response?.status ?? null,
      responseSnippet,
    });
  }

  if (candidates.length === 0) {
    return {
      ok: true,
      message:
        "Tidak ada kandidat submit. Pastikan Anda sudah menekan “Simpan dan Kirim” saat merekam, dan rekaman mencakup permintaan ke monev-api.",
      candidates: [],
    };
  }

  return {
    ok: true,
    message: `Ditemukan ${candidates.length} kandidat permintaan submit.`,
    candidates,
  };
}

/** Analisis tempelan perintah curl (salin sebagai cURL dari DevTools). */
export function analyzeCurl(raw: string): CaptureAnalysis {
  const text = raw.trim();
  if (!/curl/i.test(text)) {
    return {
      ok: false,
      message: "Teks tidak terlihat seperti perintah curl.",
      candidates: [],
    };
  }

  // Ambil URL pertama yang muncul (setelah 'curl' atau dalam tanda kutip).
  const urlMatch = text.match(/https?:\/\/[^\s'"]+/i);
  if (!urlMatch) {
    return {
      ok: false,
      message: "Tidak menemukan URL pada perintah curl.",
      candidates: [],
    };
  }
  const url = urlMatch[0];
  const path = toPath(url);

  // Metode: -X POST, atau default POST bila ada --data.
  const methodMatch = text.match(/-X\s+([A-Za-z]+)/);
  const hasData =
    /--data(-raw|-binary|-urlencode)?\s/i.test(text) || /-d\s/i.test(text);
  const method = (methodMatch?.[1] ?? (hasData ? "POST" : "GET")).toUpperCase();

  // Content-Type dari -H 'Content-Type: ...'
  const ctMatch = text.match(/-H\s+['"]content-type:\s*([^'"]+)['"]/i);
  const contentType = ctMatch?.[1]?.trim() ?? null;
  const kind = bodyKindOf(contentType);

  // Body: ambil setelah --data / --data-raw / -d, dengan pencocokan tanda
  // kutip yang SADAR-JENIS: body JSON sering berisi tanda kutip ganda di
  // dalamnya, jadi kita harus mencari penutup dengan jenis kutip yang sama,
  // bukan sekadar kutip terdekat.
  const bodyMatch = text.match(
    /(?:--data(?:-raw|-binary|-urlencode)?|-d)\s+(['"])([\s\S]*?)\1/,
  );
  const bodyText = bodyMatch?.[2] ?? "";
  const fieldNames =
    kind === "json"
      ? fieldNamesFromJson(bodyText)
      : kind === "form" || kind === "multipart"
        ? fieldNamesFromForm(bodyText)
        : [];

  // Nama-nama header (nilai dibuang).
  const headerNames: string[] = [];
  for (const m of text.matchAll(/-H\s+['"]([^:'"]+):/g)) {
    const name = m[1].trim();
    if (name && !isSecretName(name)) headerNames.push(name);
  }

  const candidate: CapturedRequest = {
    method,
    path,
    headerNames,
    contentType,
    fieldNames,
    bodyKind: kind,
    responseStatus: null,
    responseSnippet: null,
  };

  const relevant = isSubmitCandidate(method, path);
  return {
    ok: true,
    message: relevant
      ? "Terlihat seperti permintaan submit."
      : "Permintaan ini bukan kandidat submit (bukan POST ke /api/v1/ non-auth). Tetap ditampilkan agar bisa diperiksa manual.",
    candidates: [candidate],
  };
}

/**
 * Titik masuk tunggal: deteksi HAR vs curl, lalu analisis.
 * Tidak melakukan I/O apa pun.
 */
export function analyzeCapture(raw: string): CaptureAnalysis {
  const text = raw.trim();
  if (!text) {
    return { ok: false, message: "Belum ada teks yang ditempel.", candidates: [] };
  }
  if (text.startsWith("{") || text.startsWith("[")) return analyzeHar(text);
  return analyzeCurl(text);
}
