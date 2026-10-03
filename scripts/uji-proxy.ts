/**
 * Skrip diagnosis PROXY RESIDENSIAL untuk login SSO Kemnaker.
 *
 * Gunanya: membuktikan — SEBELUM dipakai produksi — bahwa proxy yang kamu beli
 * benar-benar membuat `GET https://account.kemnaker.go.id/auth` lolos, padahal
 * tanpa proxy gagal `403` + `cf-mitigated: challenge`.
 *
 * Ia menembak endpoint yang SAMA dengan langkah `sso-prime` alur login nyata,
 * jadi hasilnya mewakili kenyataan. TIDAK menyentuh password/kredensial apa pun
 * — hanya halaman publik `/auth`.
 *
 * Jalankan:
 *   npx tsx scripts/uji-proxy.ts            # baca MAGANGHUB_PROXY_URL dari .env.local
 *   npx tsx scripts/uji-proxy.ts "http://user:pass@host:port"   # coba URL lain
 *
 * Bacaan hasil:
 *   - Tanpa proxy `200/302`         -> server ini sudah lolos (mis. IP rumah).
 *   - Tanpa proxy `403 challenge`   -> wajar dari datacenter (Vercel).
 *   - Dengan proxy `200/302`        -> ✅ proxy BEKERJA. Set di Vercel, selesai.
 *   - Dengan proxy `403 challenge`  -> ❌ proxy TIDAK dipakai / IP tetap diblokir.
 *        Periksa: URL salah, sandi salah, atau proxy bukan residensial.
 *
 * Aman: URL proxy TIDAK pernah dicetak apa adanya (bisa memuat sandi) — hanya
 * host:port-nya, dan sandi disamarkan.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const SSO_AUTH_URL = "https://account.kemnaker.go.id/auth";

/** Host:port proxy tanpa kredensial, supaya sandi tak bocor ke layar. */
function safeProxyLabel(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "(default)"}`;
  } catch {
    return "(URL tidak valid)";
  }
}

type Probe = {
  status: number;
  cfMitigated: string | null;
  server: string | null;
  contentType: string | null;
  location: string | null;
  bodyLen: number;
};

/** Satu tembakan ke `/auth`, kembalikan sinyal ringkas (aman dicetak). */
async function probe(
  dispatcher?: unknown,
): Promise<Probe> {
  const init: RequestInit & { dispatcher?: unknown; redirect?: string } = {
    method: "GET",
    redirect: "manual",
    headers: {
      // UA jujur, sama seperti alur produksi — bukan spoof.
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  };
  if (dispatcher) init.dispatcher = dispatcher;

  const res = await fetch(SSO_AUTH_URL, init);
  const body = await res.text().catch(() => "");
  return {
    status: res.status,
    cfMitigated: res.headers.get("cf-mitigated"),
    server: res.headers.get("server"),
    contentType: res.headers.get("content-type"),
    location: res.headers.get("location"),
    bodyLen: body.length,
  };
}

function report(label: string, p: Probe): void {
  console.log(`\n=== ${label} ===`);
  console.log("  status      :", p.status);
  console.log("  cf-mitigated:", p.cfMitigated ?? "(tidak ada)");
  console.log("  server      :", p.server ?? "(tidak ada)");
  console.log("  content-type:", p.contentType ?? "(tidak ada)");
  if (p.location) console.log("  location    :", p.location);
  console.log("  panjang body:", p.bodyLen, "byte");
}

/** Terjemahkan hasil jadi kesimpulan tegas. */
function verdict(tanpaProxy: Probe, denganProxy: Probe | null): void {
  const lolos = (p: Probe) => p.status === 200 || p.status === 302 || p.status === 301;
  const diblokir = (p: Probe) =>
    p.status === 403 || (p.cfMitigated ?? "").length > 0;

  console.log("\n================= KESIMPULAN =================");

  if (lolos(tanpaProxy)) {
    console.log("Server ini SENDIRI sudah lolos (IP residensial / tidak diblokir).");
    console.log("Login otomatis akan jalan TANPA proxy dari mesin ini.");
  } else if (diblokir(tanpaProxy)) {
    console.log("Tanpa proxy: DIBLOKIR Cloudflare/WAF (khas datacenter Vercel).");
    console.log("-> Inilah mengapa proxy residensial diperlukan di produksi.");
  } else {
    console.log("Tanpa proxy: hasil tak terduga (status", tanpaProxy.status + ").");
  }

  if (denganProxy) {
    if (lolos(denganProxy)) {
      console.log("\n\u2705 DENGAN PROXY: LOLOS. Proxy residensial BEKERJA.");
      console.log("   Langkah berikut: set MAGANGHUB_PROXY_URL di Vercel,");
      console.log("   lalu uji login sungguhan lewat /credentials.");
    } else if (diblokir(denganProxy)) {
      console.log("\n\u274c DENGAN PROXY: MASIH DIBLOKIR. Proxy TIDAK menyelesaikan.");
      console.log("   Periksa: URL/host/port, sandi, protokol (http vs https),");
      console.log("   atau pastikan proxy benar-benar RESIDENSIAL (bukan datacenter).");
      process.exitCode = 1;
    } else {
      console.log("\n\u26a0\ufe0f  DENGAN PROXY: status", denganProxy.status, "- tidak jelas, periksa manual.");
    }
  }
  console.log("==============================================");
}

async function main(): Promise<void> {
  const argUrl = process.argv[2];
  if (argUrl) process.env.MAGANGHUB_PROXY_URL = argUrl;

  // Ditembak dulu TANPA dispatcher (= fetch biasa), sebagai pembanding.
  console.log("Menguji", SSO_AUTH_URL);
  const tanpaProxy = await probe();
  report("TANPA PROXY", tanpaProxy);

  const raw = process.env.MAGANGHUB_PROXY_URL?.trim();
  if (!raw) {
    console.log("\nMAGANGHUB_PROXY_URL kosong -> hanya uji tanpa proxy.");
    console.log("Isi di .env.local atau berikan sebagai argumen untuk membandingkan.");
    verdict(tanpaProxy, null);
    return;
  }

  console.log(`\nProxy terdeteksi: ${safeProxyLabel(raw)}`);
  const { ProxyAgent } = await import("undici");
  const agent = new ProxyAgent(raw);

  const denganProxy = await probe(agent);
  report("DENGAN PROXY", denganProxy);
  verdict(tanpaProxy, denganProxy);
}

void main().catch((err: unknown) => {
  console.error("\nGAGAL menjalankan uji proxy:");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
