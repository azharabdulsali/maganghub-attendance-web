// src/lib/cron-dispatch-run.test.ts
//
// Fokus: URUTAN sumber isi laporan yang benar-benar sampai ke `performSubmit`
// lewat cron, karena inilah jalur yang membuat laporan terkirim tanpa dibaca
// siapa pun. Bila urutan salah di sini, kesalahannya baru ketahuan di portal.
//
// Yang diuji:
//   1. commit menang atas template bertanggal & harian
//   2. tanpa commit → template bertanggal → harian
//   3. draf commit yang BARU disimpan langsung terpakai (tidak basi)
//   4. kegagalan git tidak menghalangi kirim (jatuh ke template)
//   5. benar-benar tidak ada bahan → template null (performSubmit yang membatalkan)

import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();
const submitLogFindManyMock = vi.fn();
const performSubmitMock = vi.fn();
const prepareCommitDraftMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationConfig: { findMany: (...a: unknown[]) => findManyMock(...a) },
    submitLog: { findMany: (...a: unknown[]) => submitLogFindManyMock(...a) },
  },
}));

vi.mock("@/lib/perform-submit", () => ({
  performSubmit: (...a: unknown[]) => performSubmitMock(...a),
}));

vi.mock("@/lib/commit-draft-service", () => ({
  prepareCommitDraft: (...a: unknown[]) => prepareCommitDraftMock(...a),
  contentOf: (o: { kind: string; content?: unknown }) =>
    o.kind === "SAVED" ? o.content : null,
}));

import { runDispatch } from "./cron-dispatch-run";

const COMMIT_ISI = {
  activity: "Aktivitas dari commit hari ini",
  learning: "Pembelajaran dari commit",
  obstacles: "Kendala dari commit",
};

const HARIAN = {
  activity: "Aktivitas harian",
  learning: "Pembelajaran harian",
  obstacles: "Kendala harian",
};

// `date` di DB bertipe `@db.Date` sehingga Prisma mengembalikan `Date`, BUKAN
// string. Tes harus meniru bentuk itu: `toPlainDate` memanggil `getUTCFullYear()`
// dan akan melempar bila diberi string.
const DATED = {
  date: new Date("2026-06-01T00:00:00.000Z"),
  activity: "Aktivitas khusus tanggal",
  learning: "Pembelajaran khusus tanggal",
  obstacles: "Kendala khusus tanggal",
};

/** Waktu yang jatuh pada jam 7 WIB. */
const SEKARANG = new Date("2026-06-01T00:30:00.000Z");

function config(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    hour: 7,
    minute: 0,
    user: {
      template: HARIAN,
      datedTemplates: [],
      credential: null,
      ...overrides,
    },
  };
}

/** Isi template yang akhirnya dikirim ke performSubmit. */
function templateDikirim() {
  return performSubmitMock.mock.calls[0][0].template;
}

beforeEach(() => {
  vi.clearAllMocks();
  findManyMock.mockResolvedValue([config()]);
  // Default: belum ada yang tuntas hari ini.
  submitLogFindManyMock.mockResolvedValue([]);
  performSubmitMock.mockResolvedValue({ kind: "SUCCESS", date: "2026-06-01" });
  prepareCommitDraftMock.mockResolvedValue({ kind: "NO_COMMITS", reason: "tidak ada" });
});

describe("runDispatch: urutan sumber isi", () => {
  it("commit menang atas template bertanggal DAN harian", async () => {
    findManyMock.mockResolvedValue([config({ datedTemplates: [DATED] })]);
    prepareCommitDraftMock.mockResolvedValue({ kind: "SAVED", content: COMMIT_ISI });

    await runDispatch(SEKARANG);

    expect(templateDikirim()).toEqual(COMMIT_ISI);
  });

  it("tanpa commit → template bertanggal", async () => {
    findManyMock.mockResolvedValue([config({ datedTemplates: [DATED] })]);

    await runDispatch(SEKARANG);

    expect(templateDikirim().activity).toBe("Aktivitas khusus tanggal");
  });

  it("tanpa commit & tanpa template bertanggal → template harian", async () => {
    await runDispatch(SEKARANG);
    expect(templateDikirim()).toEqual(HARIAN);
  });

  it("tidak ada bahan sama sekali → template null (dibatalkan performSubmit)", async () => {
    findManyMock.mockResolvedValue([config({ template: null })]);

    await runDispatch(SEKARANG);

    expect(templateDikirim() ?? null).toBeNull();
  });
});

describe("runDispatch: draf yang baru disimpan langsung dipakai", () => {
  it("draf SAVED terpakai walau belum terbaca ulang dari DB", async () => {
    // `datedTemplates` di sini kosong: meniru data yang dibaca SEBELUM simpan.
    // Tanpa penyuntikan isi segar, laporan akan jatuh ke template harian.
    prepareCommitDraftMock.mockResolvedValue({ kind: "SAVED", content: COMMIT_ISI });

    await runDispatch(SEKARANG);

    expect(templateDikirim()).toEqual(COMMIT_ISI);
  });

  it("draf sudah ada (suntingan pengguna) → TIDAK ditimpa, isi DB yang dipakai", async () => {
    findManyMock.mockResolvedValue([config({ datedTemplates: [DATED] })]);
    prepareCommitDraftMock.mockResolvedValue({ kind: "ALREADY_EXISTS" });

    await runDispatch(SEKARANG);

    expect(templateDikirim().activity).toBe("Aktivitas khusus tanggal");
  });

  it("menyusun draf untuk tanggal hari ini (WIB), bukan tanggal lain", async () => {
    await runDispatch(SEKARANG);
    expect(prepareCommitDraftMock).toHaveBeenCalledWith("u1", "2026-06-01");
  });
});

describe("runDispatch: ketahanan", () => {
  it("git gagal → laporan TETAP dikirim dari template", async () => {
    prepareCommitDraftMock.mockResolvedValue({ kind: "NO_COMMITS", reason: "token ditolak" });

    const hasil = await runDispatch(SEKARANG);

    expect(hasil.results[0].kind).toBe("SUCCESS");
    expect(templateDikirim()).toEqual(HARIAN);
  });

  it("penyusun draf MELEMPAR → user tidak jatuh, kirim dari template", async () => {
    prepareCommitDraftMock.mockRejectedValue(new Error("LLM down"));

    const hasil = await runDispatch(SEKARANG);

    expect(hasil.results[0].kind).toBe("ERROR");
    expect(performSubmitMock).not.toHaveBeenCalled();
  });

  it("satu user gagal tidak menjatuhkan user lain", async () => {
    findManyMock.mockResolvedValue([
      { ...config(), userId: "u1" },
      { ...config(), userId: "u2" },
    ]);
    prepareCommitDraftMock.mockImplementation((id: string) =>
      id === "u1"
        ? Promise.reject(new Error("bom"))
        : Promise.resolve({ kind: "NO_COMMITS", reason: "x" }),
    );

    const hasil = await runDispatch(SEKARANG);

    expect(hasil.results.map((r) => r.kind).sort()).toEqual(["ERROR", "SUCCESS"]);
  });
});

// ---------------------------------------------------------------------------
// Saringan tanggal pada query template bertanggal.
//
// Tanpa saringan ini dispatcher memuat SELURUH riwayat template bertanggal
// semua pengguna di setiap pemanggilan cron, padahal yang dipakai hanya baris
// tanggal hari ini. Jumlah baris bertambah tiap hari (draf commit disimpan
// sebagai baris bertanggal), jadi biayanya membesar diam-diam. Tes di bawah
// mengunci argumen query-nya supaya saringan tidak hilang tanpa ketahuan.
// ---------------------------------------------------------------------------
describe("runDispatch: query template bertanggal dibatasi hari ini", () => {
  it("menyaring datedTemplates dengan tanggal WIB dari `now`", async () => {
    await runDispatch(SEKARANG);

    const where = findManyMock.mock.calls[0][0].select.user.select.datedTemplates.where;

    // SEKARANG = 2026-06-01T00:30Z = 07:30 WIB → tanggal WIB 2026-06-01.
    expect(where.date).toBeInstanceOf(Date);
    expect(where.date.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("memakai tanggal WIB, bukan tanggal UTC", async () => {
    // 2026-06-01T18:00Z = 2026-06-02T01:00 WIB: tanggal UTC dan WIB BERBEDA.
    // Query yang memakai `new Date()` atau tanggal UTC akan menghasilkan
    // 2026-06-01 sehingga template hari ini tidak terbaca.
    await runDispatch(new Date("2026-06-01T18:00:00.000Z"));

    const where = findManyMock.mock.calls[0][0].select.user.select.datedTemplates.where;
    expect(where.date.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Tenggat internal (DISPATCH_DEADLINE_MS).
//
// Regresi yang dijaga: sebelumnya tenggat hanya diperiksa SEBELUM gelombang.
// Satu gelombang berisi 10 user yang masing-masing menunggu jaringan portal
// secara bersamaan bisa melewati `maxDuration` (60s) walau pemeriksaan
// gelombang lolos. Sekarang tenggat diperiksa LAGI per user; user yang
// terlewat dilaporkan `DEFERRED`, bukan seolah diproses.
// ---------------------------------------------------------------------------
describe("runDispatch: tenggat internal per user", () => {
  it("user di gelombang berikutnya tidak dikirim begitu tenggat terlewati", async () => {
    // DISPATCH_CONCURRENCY = 10, jadi 11 user = 2 gelombang. Gelombang pertama
    // (10 user) menghabiskan waktu melewati DISPATCH_DEADLINE_MS (50_000).
    // User ke-11 memang tidak boleh dikirim karena request sudah mendekati
    // `maxDuration` (60s): ia harus dilaporkan `DEFERRED`, bukan diproses.
    const awal = Date.parse("2026-06-01T00:30:00.000Z");
    let jamTiruan = awal;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => jamTiruan);

    performSubmitMock.mockImplementation(async () => {
      jamTiruan = awal + 60_000;
      return { kind: "SUBMITTED", ok: true, status: "SUCCESS", message: "", date: "2026-06-01" };
    });

    // Semua jam 7 WIB supaya jatuh tempo; 11 user melewati satu gelombang.
    findManyMock.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => config({ userId: `u${i + 1}` })),
    );

    try {
      const summary = await runDispatch(new Date("2026-06-01T00:30:00.000Z"));

      // Gelombang 1 dikirim (10), gelombang 2 tidak disentuh.
      expect(performSubmitMock).toHaveBeenCalledTimes(10);
      expect(summary.deadlineHit).toBe(true);
      expect(summary.processed).toBe(10);
      expect(summary.deferred).toBeGreaterThanOrEqual(1);
      expect(summary.results.every((r) => r.kind !== "DEFERRED")).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("tenggat diperiksa per user di dalam gelombang yang sama", async () => {
    // Regresi inti: semua user dalam SATU gelombang mulai bersamaan, tetapi
    // user yang baru berjalan belakangan (setelah jaringan user lain
    // menghabiskan waktu) harus dijeda. Disimulasikan dengan menunda
    // prepareCommitDraft user terakhir hingga tenggat lewat.
    const awal = Date.parse("2026-06-01T00:30:00.000Z");
    let jamTiruan = awal;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => jamTiruan);

    // User pertama memperlambat semuanya, sehingga saat `performSubmit` user
    // kedua dipanggil waktu sudah di atas tenggat.
    performSubmitMock.mockImplementation(async (arg: { userId: string }) => {
      if (arg.userId === "u1") jamTiruan = awal + 60_000;
      return { kind: "SUBMITTED", ok: true, status: "SUCCESS", message: "", date: "2026-06-01" };
    });

    findManyMock.mockResolvedValue([config({ userId: "u1" }), config({ userId: "u2" })]);

    try {
      await runDispatch(new Date("2026-06-01T00:30:00.000Z"));
      // Keduanya sudah masuk gelombang yang sama; keduanya bisa dikirim
      // (pemeriksaan per user tidak boleh MENGURANGI perilaku yang sudah ada).
      expect(performSubmitMock).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("tanpa tenggat terlewati, semua due diproses dan deadlineHit false", async () => {
    findManyMock.mockResolvedValue([config({ userId: "u1" }), config({ userId: "u2" })]);

    const summary = await runDispatch(SEKARANG);

    expect(summary.processed).toBe(2);
    expect(summary.deadlineHit).toBe(false);
    expect(summary.results.every((r) => r.kind !== "DEFERRED")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pemanggilan ulang (cron-topup.ts) pada tingkat dispatcher.
//
// Regresi yang dijaga: sebelumnya user yang tertunda pada jam jadwalnya TIDAK
// PERNAH dicoba lagi — jam berikutnya `isDueNow` menjawab "tidak" dan laporan
// hari itu hilang tanpa suara.
// ---------------------------------------------------------------------------
describe("runDispatch: pengejaran user yang tertunda", () => {
  it("user yang jadwalnya sudah lewat dan belum tuntas tetap dikirim", async () => {
    // SEKARANG = 07:30 WIB; jadwal user 06:00 sudah lewat.
    findManyMock.mockResolvedValue([
      { userId: "u1", hour: 6, minute: 0, user: config().user },
    ]);

    const summary = await runDispatch(SEKARANG);

    expect(performSubmitMock).toHaveBeenCalledTimes(1);
    expect(summary.results[0].kind).toBe("SUCCESS");
  });

  it("user yang SUDAH tuntas hari ini tidak dikirim ulang", async () => {
    findManyMock.mockResolvedValue([
      { userId: "u1", hour: 6, minute: 0, user: config().user },
    ]);
    submitLogFindManyMock.mockResolvedValue([{ userId: "u1" }]);

    const summary = await runDispatch(SEKARANG);

    expect(performSubmitMock).not.toHaveBeenCalled();
    expect(summary.results).toHaveLength(0);
    expect(summary.topUpPending).toBe(0);
  });

  it("user yang jadwalnya BELUM tiba tidak dikirim lebih awal", async () => {
    // SEKARANG = 07:30 WIB; jadwal 12:00 belum tiba.
    findManyMock.mockResolvedValue([
      { userId: "u1", hour: 12, minute: 0, user: config().user },
    ]);

    await runDispatch(SEKARANG);

    expect(performSubmitMock).not.toHaveBeenCalled();
  });

  it("jadwal yang jatuh tempo didahulukan atas pengejaran tertunda", async () => {
    // 41 kandidat: 1 jatuh tempo (jam 7) + 40 tertunda (jam 6). Kuota batch 40,
    // jadi tepat satu yang tertunda tidak sempat dan harus dilaporkan.
    findManyMock.mockResolvedValue([
      { userId: "tepat-waktu", hour: 7, minute: 0, user: config().user },
      ...Array.from({ length: 40 }, (_, i) => ({
        userId: `tertunda-${i}`,
        hour: 6,
        minute: 0,
        user: config().user,
      })),
    ]);

    const summary = await runDispatch(SEKARANG);

    // Yang jatuh tempo WAJIB ikut, bukan tergusur pengejaran.
    expect(summary.results.map((r) => r.userId)).toContain("tepat-waktu");
    expect(summary.results).toHaveLength(40);
    expect(summary.topUpPending).toBe(1);
    expect(summary.note).toContain("1");
  });

  it("kegagalan lookup 'sudah tuntas' tidak menggagalkan dispatch", async () => {
    findManyMock.mockResolvedValue([
      { userId: "u1", hour: 6, minute: 0, user: config().user },
    ]);
    submitLogFindManyMock.mockRejectedValue(new Error("db down"));

    // Tidak melempar; user tetap dicoba (performSubmit punya penjaganya sendiri).
    const summary = await runDispatch(SEKARANG);
    expect(summary.ok).toBe(true);
    expect(performSubmitMock).toHaveBeenCalledTimes(1);
  });

  it("query 'sudah tuntas' hanya membaca userId dan status TUNTAS", async () => {
    await runDispatch(SEKARANG);

    const arg = submitLogFindManyMock.mock.calls[0][0];
    expect(arg.select).toEqual({ userId: true });
    expect(arg.where.status.in).toEqual(["SUCCESS", "DUPLICATE"]);
    // Hari WIB, bukan UTC: SEKARANG = 2026-06-01T00:30Z = 07:30 WIB.
    expect(arg.where.createdAt.gte.toISOString()).toBe("2026-05-31T17:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Invarian hitungan ringkasan.
//
// Angka-angka ini dibaca admin (dan log GitHub Actions) untuk memutuskan
// "apakah semua sudah terkirim?". Hitungan yang salah lebih berbahaya daripada
// crash: ia terlihat meyakinkan. Karena itu invariannya dikunci di sini.
// ---------------------------------------------------------------------------
describe("runDispatch: invarian hitungan", () => {
  it("processed + deferred = considered (tidak ada user yang menguap)", async () => {
    // Campuran: 1 jatuh tempo, 1 sudah tuntas (dikejar → SKIPPED_ALREADY_DONE),
    // 1 jadwal belum tiba (bukan urusan pemanggilan ini).
    findManyMock.mockResolvedValue([
      { userId: "tepat", hour: 7, minute: 0, user: config().user },
      { userId: "tuntas", hour: 6, minute: 0, user: config().user },
      { userId: "nanti", hour: 20, minute: 0, user: config().user },
    ]);
    submitLogFindManyMock.mockResolvedValue([{ userId: "tuntas" }]);
    performSubmitMock.mockResolvedValue({
      kind: "SKIPPED_ALREADY_DONE",
      date: "2026-06-01",
      message: "sudah ada",
    });

    const summary = await runDispatch(SEKARANG);

    expect(summary.processed + summary.deferred).toBe(summary.considered);
  });

  it("topUpPending tidak menghitung ganda user yang sudah DEFERRED", async () => {
    // 41 kandidat tertunda (jam 6) — kuota batch 40 habis untuk pengejaran,
    // jadi 1 sisa. Semua menghasilkan hasil (SUCCESS), tidak ada yang
    // untouched, sehingga topUpPending harus tepat 1.
    findManyMock.mockResolvedValue(
      Array.from({ length: 41 }, (_, i) => ({
        userId: `u${i}`,
        hour: 6,
        minute: 0,
        user: config().user,
      })),
    );

    const summary = await runDispatch(SEKARANG);

    expect(summary.results).toHaveLength(40);
    expect(summary.topUpPending).toBe(1);
    expect(summary.processed + summary.deferred).toBe(summary.considered);
  });

  it("user yang sudah tuntas tidak menambah topUpPending", async () => {
    findManyMock.mockResolvedValue([
      { userId: "a", hour: 6, minute: 0, user: config().user },
    ]);
    submitLogFindManyMock.mockResolvedValue([{ userId: "a" }]);
    performSubmitMock.mockResolvedValue({
      kind: "SKIPPED_ALREADY_DONE",
      date: "2026-06-01",
      message: "sudah ada",
    });

    const summary = await runDispatch(SEKARANG);

    // Tidak perlu dikejar dan tidak ada catatan tertunda.
    expect(summary.topUpPending).toBe(0);
    expect(summary.note).toBeNull();
    // User ini sengaja TIDAK didatangi (sudah tuntas hari ini — pengejaran
    // memfilternya sebelum menyentuh portal sama sekali, lebih murah daripada
    // membuka sesi lalu dilewati). Karena itu hasil per-user kosong, tetapi
    // ia WAJIB tetap terhitung di `deferred` supaya totalnya utuh.
    expect(summary.results).toHaveLength(0);
    expect(summary.deferred).toBe(1);
    expect(summary.processed + summary.deferred).toBe(summary.considered);
  });

  it("tanpa kandidat sama sekali, semua angka nol dan tidak ada catatan", async () => {
    findManyMock.mockResolvedValue([]);

    const summary = await runDispatch(SEKARANG);

    expect(summary).toMatchObject({
      considered: 0,
      processed: 0,
      deferred: 0,
      topUpPending: 0,
      note: null,
      deadlineHit: false,
    });
  });
});
