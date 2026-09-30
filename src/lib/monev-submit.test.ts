// src/lib/monev-submit.test.ts: uji KERANGKA submit (docs/MONEV-API.md §8).
//
// Batas penting: tes ini HANYA menguji fungsi MURNI (buildSubmitBody &
// interpretSubmitResponse) plus satu tes `submitReport` dengan `fetch` yang
// DI-MOCK (tidak keluar jaringan sama sekali). Tidak ada request nyata ke
// portal Monev, sesuai komitmen "jangan kirim apa pun selama fase uji koneksi".

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ATTENDANCE_PRESENT,
  FIELD_NAMES,
  READ_ENDPOINTS,
  REFRESH_ENDPOINT,
  SUBMIT_ENDPOINT,
  buildSubmitBody,
  exchangeRefreshForAccess,
  interpretRefreshResponse,
  interpretSubmitResponse,
  submitReport,
  type ReportPayload,
} from "./monev-submit";

const payload: ReportPayload = {
  activity: "Aktivitas hari ini",
  learning: "Pembelajaran hari ini",
  obstacles: "Kendala hari ini",
  date: "2026-09-22",
};

describe("konstanta endpoint (rekaman §8.1, terverifikasi)", () => {
  it("submit memakai endpoint & field dari rekaman", () => {
    expect(SUBMIT_ENDPOINT.method).toBe("POST");
    expect(SUBMIT_ENDPOINT.path).toBe("/api/v1/attendances/with-daily-log");
    expect(SUBMIT_ENDPOINT.bodyKind).toBe("json");
  });
  it("nama field body persis dari rekaman", () => {
    expect(FIELD_NAMES.activity).toBe("activity_log");
    expect(FIELD_NAMES.learning).toBe("lesson_learned");
    expect(FIELD_NAMES.obstacles).toBe("obstacles");
    expect(FIELD_NAMES.attendance).toBe("status");
    expect(FIELD_NAMES.date).toBe("date");
  });
  it("'Hadir' = PRESENT (enum), bukan '1'", () => {
    expect(ATTENDANCE_PRESENT).toBe("PRESENT");
  });
  it("endpoint baca tersedia untuk cek duplikasi & verifikasi", () => {
    expect(READ_ENDPOINTS.dailyLogs).toBe("/api/v1/daily-logs");
    expect(READ_ENDPOINTS.attendances).toBe("/api/v1/attendances");
  });
});

describe("buildSubmitBody", () => {
  it("JSON: berisi semua field termasuk kehadiran & tanggal", () => {
    const { body, contentType } = buildSubmitBody(payload, "json");
    expect(contentType).toBe("application/json");
    const parsed = JSON.parse(body);
    expect(parsed[FIELD_NAMES.activity]).toBe(payload.activity);
    expect(parsed[FIELD_NAMES.learning]).toBe(payload.learning);
    expect(parsed[FIELD_NAMES.obstacles]).toBe(payload.obstacles);
    expect(parsed[FIELD_NAMES.date]).toBe(payload.date);
    // RB §11B: field kehadiran WAJIB ada, kalau tidak → "Tidak Hadir".
    expect(parsed[FIELD_NAMES.attendance]).toBe(ATTENDANCE_PRESENT);
  });

  it("form: ter-encode dan tetap memuat kehadiran", () => {
    const { body, contentType } = buildSubmitBody(payload, "form");
    expect(contentType).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(body);
    expect(params.get(FIELD_NAMES.attendance)).toBe(ATTENDANCE_PRESENT);
    expect(params.get(FIELD_NAMES.date)).toBe(payload.date);
  });

  it("field kehadiran tidak pernah kosong", () => {
    const { body } = buildSubmitBody(payload, "json");
    const parsed = JSON.parse(body) as Record<string, string>;
    expect(parsed[FIELD_NAMES.attendance]?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("interpretSubmitResponse", () => {
  it("200 → SUCCESS dan mengurai JSON", () => {
    const r = interpretSubmitResponse(200, '{"ok":true}');
    expect(r.status).toBe("SUCCESS");
    if (r.status === "SUCCESS") expect(r.raw).toEqual({ ok: true });
  });

  it("201 → SUCCESS", () => {
    expect(interpretSubmitResponse(201, "").status).toBe("SUCCESS");
  });

  it("409 → ALREADY_SUBMITTED (bukan ERROR) + pesan portal dipakai", () => {
    const r = interpretSubmitResponse(409, '{"message":"Presensi sudah ada"}');
    expect(r.status).toBe("ALREADY_SUBMITTED");
    if (r.status === "ALREADY_SUBMITTED") {
      expect(r.httpCode).toBe(409);
      // Pesan portal lebih informatif daripada teks cadangan kita.
      expect(r.message).toBe("Presensi sudah ada");
    }
  });

  it("409 tanpa body JSON → pakai teks cadangan kita", () => {
    const r = interpretSubmitResponse(409, "");
    expect(r.status).toBe("ALREADY_SUBMITTED");
    if (r.status === "ALREADY_SUBMITTED") {
      expect(r.message).toContain("sudah ada di portal");
    }
  });

  it("409 body HTML/panjang → tidak bocorkan HTML ke log, pakai cadangan", () => {
    const r = interpretSubmitResponse(409, "<html><body>error</body></html>");
    expect(r.status).toBe("ALREADY_SUBMITTED");
    if (r.status === "ALREADY_SUBMITTED") {
      expect(r.message).not.toContain("<html>");
      expect(r.message).toContain("sudah ada di portal");
    }
  });

  it("401/500 → ERROR", () => {
    expect(interpretSubmitResponse(401, "").status).toBe("ERROR");
    expect(interpretSubmitResponse(500, "").status).toBe("ERROR");
  });

  it("body non-JSON pada 200 tidak membuat crash", () => {
    const r = interpretSubmitResponse(200, "OK plain text");
    expect(r.status).toBe("SUCCESS");
    if (r.status === "SUCCESS") expect(r.raw).toBe("OK plain text");
  });
});

describe("submitReport, dengan fetch DI-MOCK (tidak keluar jaringan)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("mengirim ke endpoint benar dengan Bearer + body JSON", async () => {
    // fetchBuildId memanggil version.json dulu → balas build_id valid.
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("version.json")) {
          return new Response(JSON.stringify({ build_id: "abc-production" }), {
            status: 200,
          });
        }
        return new Response("{}", { status: 200 });
      }),
    );

    const result = await submitReport("ACCESS_TOKEN_123", payload);

    expect(result.status).toBe("SUCCESS");
    const submitCall = calls.find((c) =>
      c.url.endsWith("/api/v1/attendances/with-daily-log"),
    );
    expect(submitCall).toBeDefined();
    const headers = submitCall!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer ACCESS_TOKEN_123");
    // Bearer, BUKAN cookie refresh (§8.1).
    expect(headers.cookie).toBeUndefined();
    const sent = JSON.parse(submitCall!.init.body as string);
    expect(sent[FIELD_NAMES.attendance]).toBe(ATTENDANCE_PRESENT);
    expect(sent[FIELD_NAMES.activity]).toBe(payload.activity);
  });

  it("token akses kosong → ERROR tanpa memanggil jaringan", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const r = await submitReport("", payload);
    expect(r.status).toBe("ERROR");
    expect(spy).not.toHaveBeenCalled();
  });

  it("409 dari portal → ALREADY_SUBMITTED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("version.json")
          ? new Response(JSON.stringify({ build_id: "x-production" }), {
              status: 200,
            })
          : new Response("{}", { status: 409 }),
      ),
    );
    const r = await submitReport("TOKEN", payload);
    expect(r.status).toBe("ALREADY_SUBMITTED");
  });

  it("error jaringan → ERROR (tidak crash)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      }),
    );
    const r = await submitReport("TOKEN", payload);
    expect(r.status).toBe("ERROR");
  });
});

describe("interpretRefreshResponse (murni), §4.4", () => {
  it("401 → SESSION_DEAD (penanda sesi mati terverifikasi §4.1)", () => {
    const r = interpretRefreshResponse(401, "{}");
    expect(r.status).toBe("SESSION_DEAD");
  });

  it("200 dengan access_token di body → OK", () => {
    const r = interpretRefreshResponse(
      200,
      JSON.stringify({ access_token: "ACCESS-1" }),
    );
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.accessToken).toBe("ACCESS-1");
  });

  it("200 dengan token di dalam data → OK", () => {
    const r = interpretRefreshResponse(
      200,
      JSON.stringify({ data: { token: "ACCESS-2" } }),
    );
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.accessToken).toBe("ACCESS-2");
  });

  it("200 dengan access token di set-cookie → OK", () => {
    const r = interpretRefreshResponse(200, "{}", [
      "monev_access_token=ACCESS-3; Path=/; HttpOnly",
    ]);
    expect(r.status).toBe("OK");
    if (r.status === "OK") expect(r.accessToken).toBe("ACCESS-3");
  });

  it("cookie refresh TIDAK dianggap access token", () => {
    const r = interpretRefreshResponse(200, "{}", [
      "monev_refresh_token=REFRESH-X; Path=/; HttpOnly",
    ]);
    expect(r.status).toBe("ERROR");
  });

  it("200 tanpa token di bentuk apa pun → ERROR jujur (bukan menebak)", () => {
    const r = interpretRefreshResponse(200, JSON.stringify({ ok: true }));
    expect(r.status).toBe("ERROR");
    if (r.status === "ERROR") expect(r.message).toContain("§4.4");
  });

  it("kode lain (500) → ERROR", () => {
    expect(interpretRefreshResponse(500, "").status).toBe("ERROR");
  });
});

describe("exchangeRefreshForAccess (fetch di-mock, tidak keluar jaringan)", () => {
  it("refresh token kosong → ERROR tanpa memanggil fetch", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const r = await exchangeRefreshForAccess("   ");
    expect(r.status).toBe("ERROR");
    expect(spy).not.toHaveBeenCalled();
  });

  it("mengirim GET build-id lalu POST cookie refresh, memetakan 200 → OK", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("version.json")) {
          return new Response(JSON.stringify({ build_id: "x-production" }), {
            status: 200,
          });
        }
        calls.push({ url, init: init ?? {} });
        return new Response(JSON.stringify({ access_token: "A-9" }), {
          status: 200,
        });
      }),
    );

    const r = await exchangeRefreshForAccess("REFRESH-JWT", {
      buildId: "x-production",
    });
    expect(r.status).toBe("OK");

    const [call] = calls;
    expect(call.url).toContain(REFRESH_ENDPOINT);
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.cookie).toBe("monev_refresh_token=REFRESH-JWT");
    // Tidak boleh memakai Bearer, refresh lewat cookie.
    expect(headers.authorization).toBeUndefined();
  });

  it("401 dari portal → SESSION_DEAD", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("version.json")
          ? new Response(JSON.stringify({ build_id: "x-production" }), {
              status: 200,
            })
          : new Response("{}", { status: 401 }),
      ),
    );
    const r = await exchangeRefreshForAccess("REFRESH-JWT", {
      buildId: "x-production",
    });
    expect(r.status).toBe("SESSION_DEAD");
  });
});

describe("READ_ENDPOINTS.home (rekaman §4.5)", () => {
  it("menunjuk ke /users/me/home", () => {
    expect(READ_ENDPOINTS.home).toBe("/api/v1/users/me/home");
  });
});
