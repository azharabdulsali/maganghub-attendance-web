// src/lib/har-capture.test.ts — uji analisis rekaman HAR/curl.
//
// Modul ini tidak menyentuh jaringan; uji ini pun begitu. Yang diverifikasi
// adalah janji keamanannya: nilai rahasia (token/cookie/password) tidak boleh
// pernah muncul di hasil, sementara bentuk permintaan tetap terbaca.

import { describe, it, expect } from "vitest";
import {
  analyzeCapture,
  analyzeCurl,
  analyzeHar,
  isSecretName,
  isSubmitCandidate,
  redactValue,
} from "./har-capture";

describe("isSecretName / redactValue", () => {
  it("mengenali nama rahasia (tanpa peduli huruf besar/kecil)", () => {
    expect(isSecretName("Cookie")).toBe(true);
    expect(isSecretName("Authorization")).toBe(true);
    expect(isSecretName("X-CSRF-Token")).toBe(true);
    expect(isSecretName("password")).toBe(true);
    expect(isSecretName("Content-Type")).toBe(false);
  });

  it("menyamarkan nilai rahasia, meneruskan yang bukan", () => {
    expect(redactValue("Authorization", "Bearer rahasia123")).toBe("«disamarkan»");
    expect(redactValue("Content-Type", "application/json")).toBe(
      "application/json",
    );
  });
});

describe("isSubmitCandidate", () => {
  it("menerima POST ke /api/v1/ non-auth", () => {
    expect(isSubmitCandidate("POST", "/api/v1/report")).toBe(true);
  });
  it("menolak endpoint auth", () => {
    expect(isSubmitCandidate("POST", "/api/v1/auth/refresh")).toBe(false);
  });
  it("menolak GET dan path di luar /api/v1", () => {
    expect(isSubmitCandidate("GET", "/api/v1/report")).toBe(false);
    expect(isSubmitCandidate("POST", "/simpan")).toBe(false);
  });
});

describe("analyzeCurl", () => {
  const CURL = `curl 'https://monev-api.maganghub.kemnaker.go.id/api/v1/report/daily' \\
  -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer SECRET.TOKEN.XYZ' \\
  -H 'Cookie: monev_refresh_token=eyJhbGciOiJIUzI1NiJ9.abc.def' \\
  --data-raw '{"activity":"laporan","learning":"belajar","obstacles":"tidak ada","attendance":1}'`;

  it("mengenali method, path, dan bentuk body", () => {
    const hasil = analyzeCurl(CURL);
    expect(hasil.ok).toBe(true);
    const c = hasil.candidates[0];
    expect(c.method).toBe("POST");
    expect(c.path).toBe("/api/v1/report/daily");
    expect(c.bodyKind).toBe("json");
  });

  it("mengambil HANYA nama field body", () => {
    const c = analyzeCurl(CURL).candidates[0];
    expect(c.fieldNames).toEqual([
      "activity",
      "learning",
      "obstacles",
      "attendance",
    ]);
  });

  it("TIDAK pernah membocorkan nilai token/cookie ke hasil", () => {
    const json = JSON.stringify(analyzeCurl(CURL));
    expect(json).not.toContain("SECRET.TOKEN.XYZ");
    expect(json).not.toContain("eyJhbGciOiJIUzI1NiJ9.abc.def");
  });

  it("menolak teks yang bukan curl", () => {
    expect(analyzeCurl("halo dunia").ok).toBe(false);
  });
});

describe("analyzeHar", () => {
  const HAR = JSON.stringify({
    log: {
      entries: [
        {
          request: {
            method: "GET",
            url: "https://monev-api.maganghub.kemnaker.go.id/api/v1/calendar",
            headers: [{ name: "Content-Type", value: "application/json" }],
          },
          response: { status: 200, content: { text: '{"ok":true}' } },
        },
        {
          request: {
            method: "POST",
            url: "https://monev-api.maganghub.kemnaker.go.id/api/v1/auth/refresh",
            headers: [{ name: "Content-Type", value: "application/json" }],
          },
          response: { status: 200, content: { text: '{"session":1}' } },
        },
        {
          request: {
            method: "POST",
            url: "https://monev-api.maganghub.kemnaker.go.id/api/v1/report",
            headers: [
              { name: "Content-Type", value: "application/json" },
              { name: "Cookie", value: "monev_refresh_token=harian.rahasia.ini" },
              { name: "Authorization", value: "Bearer VERY.SECRET.TOKEN" },
            ],
            postData: {
              mimeType: "application/json",
              text: '{"activity":"a","learning":"b","obstacles":"c"}',
            },
          },
          response: {
            status: 201,
            content: { text: '{"message":"Laporan disimpan"}' },
          },
        },
      ],
    },
  });

  it("hanya mengembalikan kandidat submit (bukan GET, bukan auth)", () => {
    const hasil = analyzeHar(HAR);
    expect(hasil.ok).toBe(true);
    expect(hasil.candidates).toHaveLength(1);
    const c = hasil.candidates[0];
    expect(c.method).toBe("POST");
    expect(c.path).toBe("/api/v1/report");
    expect(c.responseStatus).toBe(201);
  });

  it("memberi nama field dan header (tanpa nilai rahasia)", () => {
    const c = analyzeHar(HAR).candidates[0];
    expect(c.fieldNames).toEqual(["activity", "learning", "obstacles"]);
    expect(c.headerNames).toContain("Content-Type");
    expect(c.headerNames).not.toContain("Cookie");
    expect(c.headerNames).not.toContain("Authorization");
  });

  it("TIDAK membocorkan token/cookie HAR ke hasil", () => {
    const json = JSON.stringify(analyzeHar(HAR));
    expect(json).not.toContain("harian.rahasia.ini");
    expect(json).not.toContain("VERY.SECRET.TOKEN");
  });

  it("menangani HAR kosong tanpa kandidat", () => {
    const hasil = analyzeHar(JSON.stringify({ log: { entries: [] } }));
    expect(hasil.ok).toBe(true);
    expect(hasil.candidates).toHaveLength(0);
  });

  it("menolak JSON yang bukan HAR", () => {
    expect(analyzeHar("bukan json").ok).toBe(false);
    expect(analyzeHar("{}").ok).toBe(false);
  });
});

describe("analyzeCapture — deteksi otomatis", () => {
  it("mengarahkan JSON ke analyzeHar", () => {
    expect(analyzeCapture('{"log":{"entries":[]}}').candidates).toEqual([]);
  });
  it("mengarahkan curl ke analyzeCurl", () => {
    expect(analyzeCapture("curl https://x/a").candidates).toHaveLength(1);
  });
  it("menolak teks kosong", () => {
    expect(analyzeCapture("   ").ok).toBe(false);
  });
});
