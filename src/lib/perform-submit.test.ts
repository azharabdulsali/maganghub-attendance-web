// Tes performSubmit(), inti yang dipakai bersama route manual & cron.
//
// Mengapa tes ini ada: sebelum refactor, logika ini tersalin di dua route dan
// TIDAK tercakup tes orkestrasi (submit-service.test.ts hanya menguji unit
// murni). Refactor tanpa tes = menebak. Tes ini mem-mock jaringan & DB
// sehingga berjalan offline dan memverifikasi tiap cabang hasil.

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock dependensi (jaringan & DB tidak pernah disentuh) ------------------
const decryptMock = vi.fn();
const submitReportMock = vi.fn();
const exchangeMock = vi.fn();
const submitLogCreateMock = vi.fn();
const credentialUpdateMock = vi.fn();

vi.mock("@/lib/crypto", () => ({
  decrypt: (...args: unknown[]) => decryptMock(...args),
}));

vi.mock("@/lib/monev-submit", () => ({
  submitReport: (...args: unknown[]) => submitReportMock(...args),
  exchangeRefreshForAccess: (...args: unknown[]) => exchangeMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    submitLog: {
      create: (...args: unknown[]) => submitLogCreateMock(...args),
    },
    maganghubCredential: {
      update: (...args: unknown[]) => credentialUpdateMock(...args),
    },
  },
}));

import { performSubmit } from "./perform-submit";

const TEMPLATE = {
  activity: "Belajar A",
  learning: "Paham B",
  obstacles: "Tidak ada",
};

const CRED = {
  tokenCiphertext: "ct",
  tokenIv: "iv",
  tokenAuthTag: "tag",
};

/** Tanggal kerja yang pasti ALLOW (Senin, jauh sebelum akhir program). */
const WEEKDAY = "2026-02-02";

function base(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    date: WEEKDAY,
    template: TEMPLATE,
    credential: CRED,
    trigger: "MANUAL" as const,
    logOnNotReady: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default tes = gerbang hidup ("1"), supaya blok "token & pengiriman" bisa
  // menguji dekripsi/tukar-token. Blok gerbang menyetelnya sendiri (delete/"0").
  process.env.ALLOW_LIVE_SUBMIT = "1";
  submitLogCreateMock.mockResolvedValue({});
});

describe("performSubmit, kesiapan", () => {
  it("tanggal tidak sah → BAD_DATE, jaringan tidak disentuh", async () => {
    const out = await performSubmit(base({ date: "bukan-tanggal" }));
    expect(out.kind).toBe("BAD_DATE");
    expect(submitReportMock).not.toHaveBeenCalled();
  });

  it("tanpa template → NOT_READY NO_TEMPLATE", async () => {
    const out = await performSubmit(base({ template: null }));
    expect(out).toMatchObject({ kind: "NOT_READY", reason: "NO_TEMPLATE" });
    expect(submitReportMock).not.toHaveBeenCalled();
  });

  it("libur: manual TIDAK mencatat log (bukan kegagalan yang bisa diulang)", async () => {
    // 2026-02-07 = Sabtu → POLICY_SKIPPED.
    const out = await performSubmit(
      base({ date: "2026-02-07", logOnNotReady: false }),
    );
    expect(out).toMatchObject({ kind: "NOT_READY", reason: "POLICY_SKIPPED" });
    expect(submitLogCreateMock).not.toHaveBeenCalled();
  });

  it("libur: cron TETAP mencatat log (Riwayat menunjukkan hari dicek)", async () => {
    const out = await performSubmit(
      base({ date: "2026-02-07", trigger: "CRON", logOnNotReady: true }),
    );
    expect(out).toMatchObject({ kind: "NOT_READY", reason: "POLICY_SKIPPED" });
    expect(submitLogCreateMock).toHaveBeenCalledTimes(1);
    expect(submitLogCreateMock.mock.calls[0][0].data.status).toBe("FAILED");
  });

  it("NO_TEMPLATE tetap dicatat meski manual (kegagalan yang bisa diulang)", async () => {
    await performSubmit(base({ template: null, logOnNotReady: false }));
    expect(submitLogCreateMock).toHaveBeenCalledTimes(1);
  });
});

describe("performSubmit, gerbang ALLOW_LIVE_SUBMIT", () => {
  it("gerbang mati → DRY_RUN, jaringan tidak disentuh", async () => {
    delete process.env.ALLOW_LIVE_SUBMIT;
    const out = await performSubmit(base());
    expect(out.kind).toBe("DRY_RUN");
    expect(submitReportMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("gerbang mati + manual → tidak mencatat log", async () => {
    delete process.env.ALLOW_LIVE_SUBMIT;
    await performSubmit(base({ logOnNotReady: false }));
    expect(submitLogCreateMock).not.toHaveBeenCalled();
  });

  it("gerbang mati + cron → mencatat log SUCCESS (dry-run itu normal)", async () => {
    delete process.env.ALLOW_LIVE_SUBMIT;
    await performSubmit(base({ trigger: "CRON", logOnNotReady: true }));
    expect(submitLogCreateMock).toHaveBeenCalledTimes(1);
    expect(submitLogCreateMock.mock.calls[0][0].data.status).toBe("SUCCESS");
  });
});

describe("performSubmit, token & pengiriman", () => {
  it("dekripsi token gagal → TOKEN_UNREADABLE + dicatat FAILED", async () => {
    decryptMock.mockImplementation(() => {
      throw new Error("bad key");
    });
    const out = await performSubmit(base());
    expect(out.kind).toBe("TOKEN_UNREADABLE");
    expect(submitLogCreateMock.mock.calls[0][0].data.status).toBe("FAILED");
  });

  it("tukar token gagal → EXCHANGE_FAILED dengan status asli", async () => {
    decryptMock.mockReturnValue("refresh-token");
    exchangeMock.mockResolvedValue({
      status: "SESSION_DEAD",
      httpCode: 401,
      message: "x",
    });
    const out = await performSubmit(base());
    expect(out).toMatchObject({ kind: "EXCHANGE_FAILED", status: "SESSION_DEAD" });
    expect(submitReportMock).not.toHaveBeenCalled();
  });

  it("SESSION_DEAD → kredensial ditandai INVALID di DB", async () => {
    decryptMock.mockReturnValue("refresh-token");
    exchangeMock.mockResolvedValue({
      status: "SESSION_DEAD",
      httpCode: 401,
      message: "x",
    });
    await performSubmit(base({ userId: "u-mati" }));
    expect(credentialUpdateMock).toHaveBeenCalledTimes(1);
    expect(credentialUpdateMock.mock.calls[0][0]).toMatchObject({
      where: { userId: "u-mati" },
      data: { status: "INVALID" },
    });
  });

  it("error jaringan saat tukar → TIDAK menandai kredensial (token belum terbukti buruk)", async () => {
    decryptMock.mockReturnValue("refresh-token");
    exchangeMock.mockResolvedValue({
      status: "ERROR",
      message: "koneksi putus",
    });
    const out = await performSubmit(base());
    expect(out.kind).toBe("EXCHANGE_FAILED");
    expect(credentialUpdateMock).not.toHaveBeenCalled();
  });

  it("pengiriman sukses → TIDAK menyentuh status kredensial", async () => {
    decryptMock.mockReturnValue("refresh-token");
    exchangeMock.mockResolvedValue({ status: "OK", accessToken: "at", httpCode: 200 });
    submitReportMock.mockResolvedValue({ status: "SUCCESS", httpCode: 200 });
    await performSubmit(base());
    expect(credentialUpdateMock).not.toHaveBeenCalled();
  });

  it("sukses → SUBMITTED ok=true + log SUCCESS dengan trigger benar", async () => {
    decryptMock.mockReturnValue("refresh-token");
    exchangeMock.mockResolvedValue({ status: "OK", accessToken: "at", httpCode: 200 });
    submitReportMock.mockResolvedValue({ status: "SUCCESS", httpCode: 200 });

    const out = await performSubmit(base({ trigger: "CRON" }));

    expect(out).toMatchObject({ kind: "SUBMITTED", ok: true, status: "SUCCESS" });
    const logged = submitLogCreateMock.mock.calls[0][0].data;
    expect(logged.trigger).toBe("CRON");
    expect(logged.status).toBe("SUCCESS");
    expect(logged.httpCode).toBe(200);
  });

  it("ALREADY_SUBMITTED → ok=false, status DUPLICATE di log", async () => {
    decryptMock.mockReturnValue("refresh-token");
    exchangeMock.mockResolvedValue({ status: "OK", accessToken: "at", httpCode: 200 });
    submitReportMock.mockResolvedValue({ status: "ALREADY_SUBMITTED", httpCode: 409 });

    const out = await performSubmit(base());

    expect(out).toMatchObject({
      kind: "SUBMITTED",
      ok: false,
      status: "ALREADY_SUBMITTED",
    });
    expect(submitLogCreateMock.mock.calls[0][0].data.status).toBe("DUPLICATE");
  });

  it("kegagalan mencatat log TIDAK menggagalkan respons portal", async () => {
    decryptMock.mockReturnValue("refresh-token");
    exchangeMock.mockResolvedValue({ status: "OK", accessToken: "at", httpCode: 200 });
    submitReportMock.mockResolvedValue({ status: "SUCCESS", httpCode: 200 });
    submitLogCreateMock.mockRejectedValue(new Error("db down"));

    const out = await performSubmit(base());
    expect(out).toMatchObject({ kind: "SUBMITTED", ok: true });
  });
});

describe("performSubmit, access token hasil login otomatis", () => {
  /** Kredensial lengkap dengan access token yang masih segar. */
  const CRED_ACCESS = {
    ...CRED,
    accessCiphertext: "act",
    accessIv: "aiv",
    accessAuthTag: "atag",
    accessExpiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
  };

  it("access token segar → pakai langsung, TIDAK menyentuh tukar-token", async () => {
    process.env.ALLOW_LIVE_SUBMIT = "1";
    decryptMock.mockReturnValue("access-token-segar");
    submitReportMock.mockResolvedValue({ status: "SUCCESS", httpCode: 200 });

    const out = await performSubmit(base({ credential: CRED_ACCESS }));

    expect(out).toMatchObject({ kind: "SUBMITTED", ok: true });
    // Inti optimasi: jalur refresh DILEWATI sepenuhnya.
    expect(exchangeMock).not.toHaveBeenCalled();
    // Token yang dikirim adalah access token, bukan hasil tukar.
    expect(submitReportMock.mock.calls[0][0]).toBe("access-token-segar");
  });

  it("access token kedaluwarsa → jatuh ke tukar refresh token", async () => {
    process.env.ALLOW_LIVE_SUBMIT = "1";
    const expired = {
      ...CRED_ACCESS,
      accessExpiresAt: new Date(Date.now() - 1000),
    };
    decryptMock.mockReturnValue("refresh-token");
    exchangeMock.mockResolvedValue({ status: "OK", accessToken: "at", httpCode: 200 });
    submitReportMock.mockResolvedValue({ status: "SUCCESS", httpCode: 200 });

    await performSubmit(base({ credential: expired }));

    expect(exchangeMock).toHaveBeenCalledTimes(1);
    expect(submitReportMock.mock.calls[0][0]).toBe("at");
  });

  it("hanya access token segar (tanpa refresh) → tetap siap & bisa submit", async () => {
    process.env.ALLOW_LIVE_SUBMIT = "1";
    const accessOnly = {
      tokenCiphertext: null,
      tokenIv: null,
      tokenAuthTag: null,
      accessCiphertext: "act",
      accessIv: "aiv",
      accessAuthTag: "atag",
      accessExpiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    };
    decryptMock.mockReturnValue("access-token-segar");
    submitReportMock.mockResolvedValue({ status: "SUCCESS", httpCode: 200 });

    const out = await performSubmit(base({ credential: accessOnly }));

    // Tanpa pemilihan access token, ini akan NOT_READY NO_TOKEN.
    expect(out).toMatchObject({ kind: "SUBMITTED", ok: true });
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("keduanya tidak ada → NOT_READY NO_TOKEN", async () => {
    const kosong = {
      tokenCiphertext: null,
      tokenIv: null,
      tokenAuthTag: null,
    };
    const out = await performSubmit(base({ credential: kosong }));
    expect(out).toMatchObject({ kind: "NOT_READY", reason: "NO_TOKEN" });
  });
});
