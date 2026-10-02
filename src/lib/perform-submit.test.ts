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
const checkDailyLogMock = vi.fn();
const submitLogCreateMock = vi.fn();
const credentialUpdateMock = vi.fn();
const holidayFindManyMock = vi.fn();

vi.mock("@/lib/crypto", () => ({
  decrypt: (...args: unknown[]) => decryptMock(...args),
}));

vi.mock("@/lib/monev-submit", () => ({
  submitReport: (...args: unknown[]) => submitReportMock(...args),
  exchangeRefreshForAccess: (...args: unknown[]) => exchangeMock(...args),
  checkDailyLogExists: (...args: unknown[]) => checkDailyLogMock(...args),
  // Kebijakan nyata: hanya ABSENT yang lolos. Disalin apa adanya agar tes
  // mencerminkan perilaku produksi, bukan versi yang dilonggarkan.
  duplicateGuardAllows: (p: { status: string }) => p.status === "ABSENT",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    submitLog: {
      create: (...args: unknown[]) => submitLogCreateMock(...args),
    },
    maganghubCredential: {
      update: (...args: unknown[]) => credentialUpdateMock(...args),
    },
    // Tabel libur admin. Default mock: kosong → `loadHolidaySet()` mengembalikan
    // `undefined` → performSubmit jatuh ke LIBUR_NASIONAL statis (auto-seed).
    // Tes yang ingin menguji pengaruh libur admin/himpunan kosong menimpanya
    // lewat `base({ holidays })`.
    holiday: {
      findMany: (...args: unknown[]) => holidayFindManyMock(...args),
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
    // Himpunan libur KOSONG secara default: tes menjadi deterministik (tak
    // bergantung isi tabel) dan tidak menyentuh DB. Tes yang ingin menguji
    // pengaruh libur admin menimpanya sendiri.
    holidays: new Set<string>(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default tes = gerbang hidup ("1"), supaya blok "token & pengiriman" bisa
  // menguji dekripsi/tukar-token. Blok gerbang menyetelnya sendiri (delete/"0").
  process.env.ALLOW_LIVE_SUBMIT = "1";
  submitLogCreateMock.mockResolvedValue({});
  // Default: tabel libur kosong (bukan error).
  holidayFindManyMock.mockResolvedValue([]);
  // Default: portal LAPOR belum ada laporan hari ini → aman lanjut kirim.
  // Tes khusus pra-cek menimpanya sendiri.
  checkDailyLogMock.mockResolvedValue({ status: "ABSENT" });
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


describe("performSubmit, daftar libur gagal dimuat (gagal-lunak)", () => {
  // Pagar PENTING: daftar libur hanya PENYEMPURNAAN. Bila tabel `holidays`
  // belum ada / DB error, pengiriman JANGAN ikut mati — pakai daftar statis.
  // Tanpa pagar ini, satu fitur pelengkap bisa mematikan seluruh otomasi.
  it("DB libur error → tetap kirim (tidak melempar ke pemanggil)", async () => {
    holidayFindManyMock.mockRejectedValueOnce(
      new Error("relation \"holidays\" does not exist"),
    );
    // Gerbang live dimatikan → cukup sampai keputusan policy (tidak menyentuh
    // jaringan portal). Yang diuji: error DB libur TIDAK menggagalkan alurnya.
    delete process.env.ALLOW_LIVE_SUBMIT;
    const out = await performSubmit({
      userId: "u1",
      date: WEEKDAY,
      template: TEMPLATE,
      credential: CRED,
      trigger: "MANUAL",
      logOnNotReady: false,
      // holidays SENGAJA tidak diberikan → performSubmit memuat sendiri dari DB.
    });
    // Hari kerja biasa → lolos keputusan, bukan melempar.
    expect(out.kind).toBe("DRY_RUN");
    expect(submitReportMock).not.toHaveBeenCalled();
  });

  it("tabel libur KOSONG → auto-seed: 25 Des 2026 (Natal) tetap libur", async () => {
    // Tanpa auto-seed, tabel kosong = nol libur → cron akan mengirim pada
    // hari Natal. Test ini mengunci pagar itu.
    holidayFindManyMock.mockResolvedValueOnce([]); // tabel kosong
    const out = await performSubmit({
      userId: "u1",
      date: "2026-12-25", // Natal, ada di LIBUR_NASIONAL statis
      template: TEMPLATE,
      credential: CRED,
      trigger: "CRON",
      logOnNotReady: true,
      // holidays tidak diberikan → performSubmit memuat dari DB (kosong).
    });
    expect(out).toMatchObject({ kind: "NOT_READY", reason: "POLICY_SKIPPED" });
  });

  it("DB libur error → jatuh ke daftar STATIS (Sabtu tetap libur)", async () => {
    holidayFindManyMock.mockRejectedValueOnce(new Error("DB down"));
    const out = await performSubmit({
      userId: "u1",
      date: "2026-02-07", // Sabtu
      template: TEMPLATE,
      credential: CRED,
      trigger: "CRON",
      logOnNotReady: true,
    });
    expect(out).toMatchObject({ kind: "NOT_READY", reason: "POLICY_SKIPPED" });
  });
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

describe("performSubmit, pra-cek duplikat (§12.6)", () => {
  function arrangeLive() {
    process.env.ALLOW_LIVE_SUBMIT = "1";
    decryptMock.mockReturnValue("refresh-token");
    exchangeMock.mockResolvedValue({ status: "OK", accessToken: "at", httpCode: 200 });
    submitReportMock.mockResolvedValue({ status: "SUCCESS", httpCode: 200 });
  }

  it("laporan sudah ada → BATAL, submit TIDAK ditembak", async () => {
    arrangeLive();
    checkDailyLogMock.mockResolvedValue({ status: "EXISTS" });

    const out = await performSubmit(base());

    expect(submitReportMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      kind: "SUBMITTED",
      ok: false,
      status: "ALREADY_SUBMITTED",
    });
    expect(submitLogCreateMock.mock.calls[0][0].data.status).toBe("DUPLICATE");
  });

  it("hasil cek tak pasti (UNKNOWN) → BATAL demi aman, tidak menimpa", async () => {
    arrangeLive();
    checkDailyLogMock.mockResolvedValue({ status: "UNKNOWN", message: "jaringan mati" });

    const out = await performSubmit(base());

    expect(submitReportMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ kind: "SUBMITTED", ok: false, status: "ERROR" });
    expect(submitLogCreateMock.mock.calls[0][0].data.status).toBe("FAILED");
  });

  it("pra-cek ABSENT → lanjut kirim seperti biasa", async () => {
    arrangeLive();
    checkDailyLogMock.mockResolvedValue({ status: "ABSENT" });

    const out = await performSubmit(base());

    expect(checkDailyLogMock).toHaveBeenCalledWith("at", WEEKDAY);
    expect(submitReportMock).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ kind: "SUBMITTED", ok: true });
  });

  it("pra-cek DILEWATI saat dry-run (tidak menyentuh jaringan portal)", async () => {
    process.env.ALLOW_LIVE_SUBMIT = "0";

    const out = await performSubmit(base());

    expect(out.kind).toBe("DRY_RUN");
    expect(checkDailyLogMock).not.toHaveBeenCalled();
    expect(submitReportMock).not.toHaveBeenCalled();
  });
});

    const out = await performSubmit(base({ credential: kosong }));
    expect(out).toMatchObject({ kind: "NOT_READY", reason: "NO_TOKEN" });
  });
});
