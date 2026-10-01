// src/lib/report-draft-llm.test.ts: uji jalur LLM TANPA memanggil Google.
//
// `fetch` selalu di-stub. Ini bukan sekadar kerapian: tes yang menghubungi
// layanan luar akan rapuh (jaringan kantor, kuota, CI tanpa internet) dan
// membuat hasil uji bergantung pada pihak ketiga.
//
// Yang diuji adalah JARING PENGAMAN, bukan kualitas tulisan model:
//   - jawaban bagus -> dipakai
//   - jawaban cacat / bukan JSON / kolom kurang -> ditolak (null)
//   - error HTTP / jaringan / timeout -> ditolak (null)
// Pemanggil (draftWithFallback) yang mengubah null menjadi "pakai lokal".

import { afterEach, describe, expect, it, vi } from "vitest";

import { checkReportField, MIN_REPORT_LENGTH, countReportLength } from "./report-rules";

/** Panjang aman: jauh di atas batas portal, jadi tidak ragu soal margin. */
const TEKS_PANJANG = (pokok: string) =>
  `${pokok} dan seluruh rangkaian kegiatan berjalan sesuai rencana kerja yang telah disusun bersama pembimbing lapangan, hasilnya diperiksa ulang sebelum dilaporkan kepada pihak terkait.`;

/** Balasan Gemini yang sehat. */
function balasanSehat() {
  return {
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [
            {
              text: JSON.stringify({
                activity: TEKS_PANJANG("Mengerjakan migrasi skema basis data"),
                learning: TEKS_PANJANG("Memahami pentingnya pencadangan sebelum mengubah struktur"),
                obstacles: TEKS_PANJANG("Tidak ada kendala berarti hari ini"),
              }),
            },
          ],
        },
      },
    ],
  };
}

function stubFetch(payload: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true;
  return vi.fn(async () =>
    ({
      ok,
      status: init?.status ?? (ok ? 200 : 429),
      json: async () => payload,
    }) as Response,
  );
}

/** Env WAJIB (bukan rahasia asli) supaya `env.ts` bisa diimpor di tes mana pun.
 *  Sama seperti pola `crypto.test.ts`: validator `env.ts` berjalan saat impor,
 *  jadi nilainya harus siap SEBELUM modul dimuat. */
const ENV_WAJIB = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/db",
  NEXTAUTH_SECRET: "a".repeat(32),
  NEXTAUTH_URL: "http://localhost:3000",
  ENCRYPTION_KEY: "0123456789abcdef".repeat(4),
};

/**
 * Muat ulang modul supaya `env` terbaca dengan key yang sedang di-set.
 *
 * `process.env` TIDAK boleh dikosongkan: `env.ts` memvalidasi saat impor dan
 * akan melempar error bila variabel wajibnya hilang. Jadi env wajib selalu
 * dipasang, hanya GEMINI_* yang diatur per kasus uji.
 */
async function muatModul(geminiKey: string, model = "gemini-flash-lite-latest") {
  process.env = {
    ...process.env,
    ...ENV_WAJIB,
    GEMINI_API_KEY: geminiKey,
    GEMINI_MODEL: model,
  };
  vi.resetModules();
  return await import("./report-draft-llm");
}

describe("geminiDrafter", () => {
  const KEY = "AIza-palsu-untuk-pengujian-panjang";

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("llmConfigured() true saat key terisi", async () => {
    const mod = await muatModul(KEY);
    expect(mod.llmConfigured()).toBe(true);
  });

  it("menerima jawaban sehat dan mengembalikan tiga kolom yang lolos validasi", async () => {
    vi.stubGlobal("fetch", stubFetch(balasanSehat()));
    const mod = await muatModul(KEY);

    const hasil = await mod.geminiDrafter.draft({ keywords: "migrasi skema" });
    expect(hasil).not.toBeNull();
    for (const teks of Object.values(hasil!)) {
      expect(checkReportField(teks)).toBeNull();
      expect(countReportLength(teks)).toBeGreaterThanOrEqual(MIN_REPORT_LENGTH);
    }
  });

  it("mengirim key lewat header, bukan query string", async () => {
    const spy = stubFetch(balasanSehat());
    vi.stubGlobal("fetch", spy);
    const mod = await muatModul(KEY);

    await mod.geminiDrafter.draft({ keywords: "uji" });

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    // Kunci TIDAK boleh muncul di URL: URL tercatat di log server/proksi.
    expect(String(url)).not.toContain("AIza-palsu");
    expect(String(url)).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toContain("AIza-palsu");
  });

  it("menolak jawaban yang bukan JSON (model berhalusinasi)", async () => {
    vi.stubGlobal("fetch", stubFetch({
      candidates: [{ content: { parts: [{ text: "Tentu! Berikut laporannya..." }] } }],
    }));
    const mod = await muatModul(KEY);
    expect(await mod.geminiDrafter.draft({ keywords: "uji" })).toBeNull();
  });

  it("menerima JSON yang terbungkus pagar markdown", async () => {
    const isi = JSON.parse(balasanSehat().candidates[0].content.parts[0].text);
    vi.stubGlobal("fetch", stubFetch({
      candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(isi) + "\n```" }] } }],
    }));
    const mod = await muatModul(KEY);
    expect(await mod.geminiDrafter.draft({ keywords: "uji" })).not.toBeNull();
  });

  it("menolak jawaban yang kolomnya kurang", async () => {
    vi.stubGlobal("fetch", stubFetch({
      candidates: [{
        content: { parts: [{ text: JSON.stringify({ activity: TEKS_PANJANG("kerja") }) }] },
      }],
    }));
    const mod = await muatModul(KEY);
    expect(await mod.geminiDrafter.draft({ keywords: "uji" })).toBeNull();
  });

  it("menolak kolom yang terlalu pendek, agar tombol Simpan tidak tetap mati", async () => {
    vi.stubGlobal("fetch", stubFetch({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              activity: "kerja singkat",
              learning: "belajar singkat",
              obstacles: "tidak ada",
            }),
          }],
        },
      }],
    }));
    const mod = await muatModul(KEY);
    expect(await mod.geminiDrafter.draft({ keywords: "uji" })).toBeNull();
  });

  it("menolak saat kuota habis (HTTP 429)", async () => {
    vi.stubGlobal("fetch", stubFetch({ error: { message: "quota" } }, { ok: false, status: 429 }));
    const mod = await muatModul(KEY);
    expect(await mod.geminiDrafter.draft({ keywords: "uji" })).toBeNull();
  });

  it("menolak saat jaringan gagal, tanpa melempar error ke pemanggil", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const mod = await muatModul(KEY);
    await expect(mod.geminiDrafter.draft({ keywords: "uji" })).resolves.toBeNull();
  });

  it("menolak saat model menolak menjawab (candidates kosong)", async () => {
    vi.stubGlobal("fetch", stubFetch({ promptFeedback: { blockReason: "SAFETY" } }));
    const mod = await muatModul(KEY);
    expect(await mod.geminiDrafter.draft({ keywords: "uji" })).toBeNull();
  });

  it("mengulang saat server sibuk (503), lalu berhasil", async () => {
    // Nyata: Gemini acak membalas 503 "model overloaded". Sekali percobaan
    // membuat fitur terasa kadang jalan kadang tidak.
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      n++;
      if (n === 1) return { ok: false, status: 503, json: async () => ({}) } as Response;
      return { ok: true, status: 200, json: async () => balasanSehat() } as Response;
    }));
    const mod = await muatModul(KEY);
    expect(await mod.geminiDrafter.draft({ keywords: "uji" })).not.toBeNull();
    expect(n).toBe(2);
  });

  it("menyerah setelah 3 percobaan bila server terus sibuk", async () => {
    const spy = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response);
    vi.stubGlobal("fetch", spy);
    const mod = await muatModul(KEY);
    expect(await mod.geminiDrafter.draft({ keywords: "uji" })).toBeNull();
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("TIDAK mengulang saat 404 (salah model/key): sekali panggil lalu menyerah", async () => {
    // Regresi: model salah pernah membuat 404 berulang tanpa guna.
    const spy = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
    vi.stubGlobal("fetch", spy);
    const mod = await muatModul(KEY);
    expect(await mod.geminiDrafter.draft({ keywords: "uji" })).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("TIDAK mengulang saat 401 (key ditolak)", async () => {
    const spy = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response);
    vi.stubGlobal("fetch", spy);
    const mod = await muatModul(KEY);
    expect(await mod.geminiDrafter.draft({ keywords: "uji" })).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("memakai jalur /v1beta, bukan /v1 yang selalu 404", async () => {
    const spy = stubFetch(balasanSehat());
    vi.stubGlobal("fetch", spy);
    const mod = await muatModul(KEY);
    await mod.geminiDrafter.draft({ keywords: "uji" });
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(String(url)).toContain("/v1beta/models");
  });

  it("memakai model default yang stabil saat GEMINI_MODEL kosong", async () => {
    const spy = stubFetch(balasanSehat());
    vi.stubGlobal("fetch", spy);
    const mod = await muatModul(KEY, "");
    await mod.geminiDrafter.draft({ keywords: "uji" });
    const [url] = spy.mock.calls[0] as unknown as [string];
    // `-lite-latest` dipilih karena kuota gratisnya jauh lebih lega daripada
    // `-latest` biasa (yang hanya 20 permintaan/hari), dan alias ini tahan
    // terhadap penghapusan nama versi spesifik oleh Google.
    expect(String(url)).toContain("gemini-flash-lite-latest");
  });
});

describe("llmConfigured", () => {
  it("false saat key kosong", async () => {
    const mod = await muatModul("");
    expect(mod.llmConfigured()).toBe(false);
  });

  it("false saat key hanya berisi spasi", async () => {
    const mod = await muatModul("        ");
    expect(mod.llmConfigured()).toBe(false);
  });

  it("false saat key kelihatan terisi tapi terlalu pendek (salah tempel)", async () => {
    const mod = await muatModul("abc");
    expect(mod.llmConfigured()).toBe(false);
  });
});

describe("endpointUntuk", () => {
  // Regresi nyata: pemilik memakai key bentuk baru, dan kode ini SALAH
  // mengasumsikan key `AQ.` butuh jalur `/v1`. Hasilnya 404 terus, dan fitur
  // selalu diam-diam jatuh ke penyusun lokal.
  it("selalu memakai jalur /v1beta, apa pun bentuk key-nya", async () => {
    const mod = await muatModul("");
    expect(mod.endpointUntuk()).toContain("/v1beta/models");
  });

  it("TIDAK pernah memakai jalur /v1 yang selalu 404", async () => {
    const mod = await muatModul("");
    expect(mod.endpointUntuk()).not.toMatch(/\/v1\/models/);
  });
});
