"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ClipboardPaste,
  ExternalLink,
  Loader2,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  cleanPastedToken,
  describeTokenShapeProblem,
} from "@/lib/token-input";
import {
  daysUntilRefreshExpiry,
  refreshTokenExpiresAt,
} from "@/lib/refresh-token-age";
import {
  isUnsolvableCloudflareChallenge,
  type PrimeRejectionInfo,
} from "@/lib/sso-prime-response";

type Props = {
  hasExisting: boolean;
  existingEmail: string | null;
  existingStatus: string | null;
  updatedAt: string | null;
  /** Apakah sudah ada token (`monev_refresh_token`) tersimpan. */
  hasToken: boolean;
};

function formatTanggal(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "-";
  }
}

export default function CredentialsForm({
  hasExisting,
  existingEmail,
  existingStatus,
  updatedAt,
  hasToken,
}: Props) {
  const router = useRouter();
  const toast = useToast();

  // Kalau sudah ada kredensial, form disembunyikan dulu, supaya tidak
  // sengaja/tidak sengaja menimpa password yang sudah benar.
  const [mode, setMode] = useState<"lihat" | "isi">(
    hasExisting ? "lihat" : "isi",
  );

  const [emailMonev, setEmailMonev] = useState(existingEmail ?? "");
  const [passwordMonev, setPasswordMonev] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmHapusOpen, setConfirmHapusOpen] = useState(false);

  // --- Login otomatis (Opsi A, docs/MONEV-API.md §7) ---
  const [loginMsg, setLoginMsg] = useState<string | null>(null);
  const [loginState, setLoginState] = useState<
    "idle" | "ok" | "rejected" | "error"
  >("idle");
  const [loginLoading, setLoginLoading] = useState(false);
  // Kategori penolakan dari server ("waf" bila diblokir proteksi). Dipakai
  // untuk menampilkan panduan tempel token manual, BUKAN menyalahkan password.
  const [loginKind, setLoginKind] = useState<"waf" | "page" | "unknown" | null>(
    null,
  );
  // Fakta non-rahasia dari respons penolakan (HTTP/kategori/server/url final).
  // Hanya untuk membantu diagnosis; tidak ada token/cookie/password di sini.
  const [loginPrime, setLoginPrime] = useState<PrimeRejectionInfo | null>(null);

  // Bila buktinya Cloudflare Managed Challenge (`cf-mitigated=challenge`), langkah
  // LOGIN otomatis dari server tidak bisa lewat (butuh browser + IP residensial).
  // Sesi hasil login manual user TETAP bisa dipakai dari server (terbukti ACTIVE).
  const isUnsolvable = isUnsolvableCloudflareChallenge(loginPrime);

  // --- Tempel token manual (Opsi C1, docs/MONEV-API.md §7) ---
  // Ini jalur cadangan resmi saat login otomatis diblokir proteksi portal.
  // Token disimpan terenkripsi dan diuji ke portal; respons tak pernah
  // memuat token mentah.
  const [token, setToken] = useState("");
  const [tokenMsg, setTokenMsg] = useState<string | null>(null);
  const [tokenState, setTokenState] = useState<
    "idle" | "ok" | "invalid" | "error"
  >("idle");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [adaToken, setAdaToken] = useState(hasToken);
  // Pesan saat kami membuang awalan yang ikut tersalin (mis. "Cookie: ...").
  // Ditampilkan sekali agar pengguna tahu templatannya sudah dibersihkan.
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);
  // Sisa hari masa berlaku token yang baru saja berhasil diuji (null = tak
  // diketahui; kami TIDAK menebak 30 hari, lihat refresh-token-age.ts).
  const [tokenHari, setTokenHari] = useState<number | null>(null);

  async function simpanToken(e: React.FormEvent) {
    e.preventDefault();
    setTokenMsg(null);
    setTokenState("idle");
    setTokenNotice(null);
    setTokenHari(null);

    // Bersihkan tempelan (buang "Cookie: ", "monev_refresh_token=", kutip,
    // spasi ujung) SEBELUM dikirim. Ini kesalahan tempel paling sering.
    const { value: bersih, cleaned } = cleanPastedToken(token);
    if (cleaned) {
      setToken(bersih);
      setTokenNotice(
        "Kami membuang bagian nama cookie/header dari tempelan Anda, dan " +
          "hanya memakai nilai tokennya.",
      );
    }

    // Umpan balik instan: bentuk salah tidak perlu memanggil server dulu.
    const masalah = describeTokenShapeProblem(bersih);
    if (masalah) {
      setTokenState("invalid");
      setTokenMsg(masalah);
      toast.error("Periksa token", masalah);
      return;
    }

    setTokenLoading(true);

    try {
      const res = await fetch("/api/credentials/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: bersih }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setTokenState("error");
        setTokenMsg(data.error ?? "Gagal menyimpan token.");
        toast.error("Gagal menyimpan token", data.error ?? "Coba lagi.");
        return;
      }

      if (data.status === "ACTIVE") {
        // Baca masa berlaku dari token yang baru diuji, SEBELUM state direset.
        // null = tak terbaca → tidak menampilkan apa pun (jangan menebak).
        setTokenHari(daysUntilRefreshExpiry(refreshTokenExpiresAt(bersih)));
        setTokenState("ok");
        setTokenMsg(data.message ?? "Sesi Monev aktif dan valid.");
        setToken(""); // jangan biarkan token tertinggal di state
        setAdaToken(true);
        toast.success("Token tersimpan", "Sesi Monev aktif.");
        router.refresh();
      } else if (data.status === "INVALID") {
        setTokenState("invalid");
        setTokenMsg(
          data.message ??
            "Token tidak valid. Login ulang di portal lalu tempel token baru.",
        );
        toast.error(
          "Token tidak valid",
          "Login ulang di portal lalu tempel token baru.",
        );
      } else {
        setTokenState("error");
        setTokenMsg(
          data.message ??
            "Tes koneksi belum bisa memastikan hasilnya. Coba lagi sebentar.",
        );
        toast.error("Tes koneksi gagal", "Coba lagi sebentar.");
      }
    } catch {
      setTokenState("error");
      setTokenMsg("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setTokenLoading(false);
    }
  }

  async function loginOtomatis() {
    setLoginMsg(null);
    setLoginState("idle");
    setLoginKind(null);
    setLoginPrime(null);
    setLoginLoading(true);

    try {
      const res = await fetch("/api/credentials/login", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        error?: string;
        kind?: "waf" | "page" | "unknown" | null;
        prime?: PrimeRejectionInfo | null;
      };

      if (!res.ok) {
        setLoginState("error");
        setLoginMsg(data.error ?? "Login otomatis gagal dijalankan.");
        toast.error(
          "Login otomatis gagal",
          data.error ?? "Periksa email & password Monev Anda.",
        );
        return;
      }

      if (data.status === "ACTIVE") {
        setLoginState("ok");
        setLoginMsg(data.message ?? "Login otomatis berhasil.");
        toast.success("Sesi Monev terhubung", "Sesi berhasil disimpan.");
        router.refresh();
      } else if (data.status === "REJECTED") {
        setLoginState("rejected");
        setLoginMsg(
          data.message ??
            "Portal menolak login. Periksa email & password Monev Anda.",
        );
        toast.error(
          "Portal menolak login",
          "Periksa email & password Monev Anda.",
        );
        router.refresh();
      } else {
        setLoginState("error");
        setLoginKind(data.kind ?? null);
        setLoginPrime(data.prime ?? null);
        setLoginMsg(
          data.message ??
            "Login otomatis belum bisa memastikan hasilnya. Coba lagi sebentar.",
        );
        // Blokir WAF = bukan soal kredensial; arahkan ke jalur token manual.
        if (data.kind === "waf") {
          toast.info(
            "Login otomatis diblokir portal",
            "Bukan soal password Anda. Gunakan cara tempel token di bawah.",
          );
        } else {
          toast.error(
            "Login otomatis belum berhasil",
            "Coba lagi, atau pakai cara tempel token manual.",
          );
        }
      }
    } catch {
      setLoginState("error");
      setLoginMsg("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSukses(null);
    setLoading(true);

    try {
      const res = await fetch("/api/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailMonev, passwordMonev }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        const pesan = data.error ?? "Gagal menyimpan kredensial";
        setError(pesan);
        toast.error("Gagal menyimpan kredensial", pesan);
        return;
      }

      setPasswordMonev(""); // jangan biarkan password tertinggal di state
      setSukses("Kredensial berhasil disimpan. Tekan \"Uji login\" di bawah.");
      setMode("lihat");
      toast.success(
        "Kredensial tersimpan",
        "Email & password Monev disimpan terenkripsi. Silakan uji login.",
      );
      router.refresh();
    } catch {
      const pesan = "Tidak dapat menghubungi server. Periksa koneksi Anda.";
      setError(pesan);
      toast.error("Gagal menyimpan kredensial", pesan);
    } finally {
      setLoading(false);
    }
  }

  async function hapus() {
    setError(null);
    setSukses(null);
    setLoading(true);

    try {
      const res = await fetch("/api/credentials", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        const pesan = data.error ?? "Gagal menghapus kredensial";
        setError(pesan);
        toast.error("Gagal menghapus kredensial", pesan);
        return;
      }

      setEmailMonev("");
      setSukses("Kredensial dihapus.");
      setMode("isi");
      toast.success("Kredensial dihapus", "Absensi otomatis perlu diisi ulang.");
      router.refresh();
    } catch {
      const pesan = "Tidak dapat menghubungi server. Periksa koneksi Anda.";
      setError(pesan);
      toast.error("Gagal menghapus kredensial", pesan);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {sukses && <Message tone="good">{sukses}</Message>}

      {error && <Message tone="bad">{error}</Message>}

      {mode === "lihat" ? (
        <Card>
          <CardHeader>
            <CardTitle>Hubungkan akun Monev</CardTitle>
            <CardDescription>
              Password tidak bisa ditampilkan kembali, hanya bisa diganti. Tekan
              uji login untuk memastikan kredensial bisa dipakai.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <dt className="font-heading sm:w-40">Email Monev</dt>
                <dd className="break-all text-foreground/80">
                  {existingEmail ?? "-"}
                </dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <dt className="font-heading sm:w-40">Status</dt>
                <dd>
                  <Badge className="px-3 py-1">
                    {existingStatus ?? "-"}
                  </Badge>
                </dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <dt className="font-heading sm:w-40">Terakhir diubah</dt>
                <dd className="text-foreground/80">{formatTanggal(updatedAt)}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Button
                className="w-full sm:w-auto"
                onClick={loginOtomatis}
                disabled={loginLoading || loading}
                variant="success"
                title={loginLoading ? "Menguji…" : "Uji login"}
                aria-label={loginLoading ? "Menguji login" : "Uji login"}
              >
                {loginLoading ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <ShieldCheck aria-hidden />
                )}
                {loginLoading ? "Menguji..." : "Uji login"}
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="neutral"
                onClick={() => setMode("isi")}
                disabled={loading || loginLoading}
                title="Ganti kredensial"
                aria-label="Ganti kredensial"
              >
                <Pencil aria-hidden />
                Ganti kredensial
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="danger"
                onClick={() => setConfirmHapusOpen(true)}
                disabled={loading || loginLoading}
                title="Hapus kredensial"
                aria-label="Hapus kredensial"
              >
                <Trash2 aria-hidden />
                Hapus
              </Button>
            </div>

            {/* Ekspektasi jujur: bila server diblokir WAF (bukan kredensial
                salah), jangan menyalahkan password pengguna. Saat buktinya
                Cloudflare Managed Challenge (`cf-mitigated=challenge`), login
                otomatis dari server TIDAK mungkin berhasil — katakan terus
                terang, jangan menyuruh "coba lagi". */}
            {isUnsolvable && loginState === "error" ? (
              <Message tone="neutral">
                <strong>Portal memasang Cloudflare Managed Challenge.</strong>{" "}
                Tantangan ini menuntut browser asli menjalankan JavaScript, jadi
                langkah <strong>login</strong> otomatis dari server{" "}
                <strong>tidak bisa</strong> lewat. Ini bukan kesalahan Anda dan
                tidak bisa &ldquo;dicoba lagi&rdquo;. Kabar baiknya: Anda cukup
                login <strong>sekali</strong> di browser sendiri, lalu
                menempelkan <strong>token</strong> di bagian cadangan bawah.
                Setelah itu sesi bertahan sekitar 30 hari dan absensi otomatis
                berjalan normal.
              </Message>
            ) : (
              loginMsg && (
                <Message tone={loginState === "ok" ? "good" : "bad"}>
                  {loginMsg}
                </Message>
              )
            )}

            {/* Fakta non-rahasia dari respons penolakan. Sengaja ditutup
                bawaan (pengguna awam tak perlu), tapi bisa dibuka & disalin
                saat perlu melaporkan masalah. Tidak memuat token/cookie/
                password. */}
            {loginState === "error" && loginPrime && (
              <details className="rounded-base border-2 border-border bg-background p-3 text-xs text-foreground/80">
                <summary className="cursor-pointer font-heading text-foreground/90">
                  Detail teknis penolakan (untuk laporan)
                </summary>
                <ul className="mt-2 space-y-0.5 font-mono">
                  {loginPrime.httpCode !== undefined && (
                    <li>http={loginPrime.httpCode}</li>
                  )}
                  {loginPrime.kind && <li>kategori={loginPrime.kind}</li>}
                  {loginPrime.server && <li>server={loginPrime.server}</li>}
                  {loginPrime.cfMitigated && (
                    <li>cf-mitigated={loginPrime.cfMitigated}</li>
                  )}
                  {loginPrime.contentType && (
                    <li>content-type={loginPrime.contentType}</li>
                  )}
                  {loginPrime.finalUrl && <li>url={loginPrime.finalUrl}</li>}
                </ul>
                <p className="mt-2 text-foreground/60">
                  Ini tidak berisi token, cookie, atau password — aman
                  dibagikan.
                </p>
              </details>
            )}

            {/* Fallback kontekstual: bila server diblokir WAF (bukan kredensial
                salah), jangan biarkan pengguna menebak. Arahkan jelas ke jalur
                cadangan (tempel token) di bagian bawah halaman
                (§ C1, docs/MONEV-API.md §7). */}
            {loginState === "error" && loginKind === "waf" && (
              <div className="space-y-2 rounded-base border-2 border-border bg-background p-3 text-sm text-foreground/90">
                <p className="font-heading text-foreground">
                  Ini bukan soal email &amp; password Anda
                </p>
                <p>
                  Portal menolak permintaan dari server kami (proteksi
                  anti-bot), bukan menolak kredensial Anda. Email &amp; password
                  Anda tetap benar. Pakai <strong>cara tempel token</strong> di
                  bagian cadangan bawah sebagai gantinya:
                </p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    Buka{" "}
                    <span className="font-medium">maganghub.kemnaker.go.id</span>{" "}
                    di browser Anda (Chrome/Edge), lalu login seperti biasa.
                  </li>
                  <li>
                    Ambil cookie <code>monev_refresh_token</code> lewat DevTools
                    — rinciannya di bawah.
                  </li>
                  <li>
                    Tempel &amp; simpan di kartu{" "}
                    <strong>Hubungkan sesi Monev</strong> di bagian cadangan
                    bawah halaman ini.
                  </li>
                </ol>
                <Button
                  variant="neutral"
                  onClick={() =>
                    window.open(
                      "https://monev.maganghub.kemnaker.go.id",
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  title="Buka portal Monev di tab baru"
                  aria-label="Buka portal Monev di tab baru"
                >
                  <ExternalLink aria-hidden />
                  Buka portal Monev di tab baru
                </Button>
              </div>
            )}

          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {hasExisting ? "Ganti kredensial" : "Hubungkan akun Monev"}
            </CardTitle>
            <CardDescription>
              Isi email &amp; password portal MagangHub/Kemnaker Anda. Password
              disimpan terenkripsi (AES-256-GCM) dan tidak bisa dibaca kembali.
              Setelah tersimpan, tekan uji login untuk memastikan kredensial
              bisa dipakai.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={simpan} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emailMonev">Email Monev</Label>
                <Input
                  id="emailMonev"
                  type="email"
                  required
                  autoComplete="username"
                  value={emailMonev}
                  onChange={(e) => setEmailMonev(e.target.value)}
                  placeholder="nama@contoh.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passwordMonev">Password Monev</Label>
                <PasswordInput
                  id="passwordMonev"
                  required
                  autoComplete="current-password"
                  value={passwordMonev}
                  onChange={(e) => setPasswordMonev(e.target.value)}
                  placeholder="Password portal Maganghub"
                />
              </div>

              <div className="flex flex-row flex-wrap items-center justify-end gap-3">
                <Button
                  type="submit"
                  variant="success"
                  disabled={loading}
                  title={loading ? "Menyimpan…" : "Simpan"}
                  aria-label="Simpan"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Save aria-hidden />
                  )}
                  {loading ? "Menyimpan..." : "Simpan"}
                </Button>
                {hasExisting && (
                  <Button
                    type="button"
                    variant="neutral"
                    onClick={() => {
                      setMode("lihat");
                      setPasswordMonev("");
                      setError(null);
                    }}
                    disabled={loading}
                    title="Batal"
                    aria-label="Batal"
                  >
                    <X aria-hidden />
                    Batal
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Jalur cadangan: tempel token manual (Opsi C1, docs/MONEV-API.md §7).
          Disembunyikan bawaan (pola <details>/<summary> native) supaya pengguna
          biasa cukup memakai jalur utama email+password di atas. Dibuka hanya
          saat uji login diblokir proteksi anti-bot portal: login dulu lewat
          browser, salin cookie `monev_refresh_token` dari DevTools, tempel di
          sini. Token diuji ke portal & disimpan terenkripsi. */}
      <Card>
        <details className="rounded-base">
          <summary className="cursor-pointer list-none p-4 font-heading focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            Jalur cadangan: tempel token Monev (bila uji login diblokir)
          </summary>
          <CardHeader>
            <CardTitle>Hubungkan sesi Monev (cadangan)</CardTitle>
            <CardDescription>
              Login dulu di portal MagangHub lewat browser, lalu salin cookie{" "}
              <code>monev_refresh_token</code> dari DevTools dan tempel di sini.
              Kami uji ke portal dan simpan terenkripsi. Tidak ada laporan yang
              dikirim. Sesi ini berlaku sekitar 30 hari.
            </CardDescription>
            <Button
              variant="neutral"
              className="mt-3 w-fit"
              onClick={() =>
                window.open(
                  "https://monev.maganghub.kemnaker.go.id",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              title="Buka portal Monev di tab baru"
              aria-label="Buka portal Monev di tab baru"
            >
              <ExternalLink aria-hidden />
              Buka portal Monev di tab baru
            </Button>
          </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={simpanToken} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="monevToken">
                Token sesi (<code>monev_refresh_token</code>)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="monevToken"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Tempel token (tiga bagian dipisah titik)"
                />
                {/* Tombol tempel: menyelamatkan pengguna ponsel dari
                    klik-kanan → tempel. Cara sama seperti automation-form. */}
                <Button
                  type="button"
                  variant="neutral"
                  onClick={async () => {
                    try {
                      const teks = await navigator.clipboard.readText();
                      if (teks.trim() !== "") {
                        setToken(teks);
                        toast.info(
                          "Ditempel",
                          "Periksa isinya, lalu tekan Simpan & uji koneksi.",
                        );
                      } else {
                        toast.info(
                          "Papan klip kosong",
                          "Salin dulu nilai token di DevTools.",
                        );
                      }
                    } catch {
                      toast.error(
                        "Tidak bisa membaca papan klip",
                        "Tempel manual dengan Ctrl+V.",
                      );
                    }
                  }}
                  disabled={tokenLoading}
                  title="Tempel token dari papan klip"
                  aria-label="Tempel token dari papan klip"
                >
                  <ClipboardPaste aria-hidden />
                  Tempel
                </Button>
              </div>
              <p className="text-xs text-foreground/70">
                Belum punya token?{" "}
                <Link
                  href="/panduan/ambil-token-monev-devtools"
                  className="underline underline-offset-4 hover:opacity-80"
                >
                  Lihat cara mengambilnya di DevTools
                </Link>{" "}
                atau{" "}
                <a
                  href="https://monev.maganghub.kemnaker.go.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:opacity-80"
                >
                  buka portal MagangHub
                </a>{" "}
                untuk login lebih dulu.
              </p>
            </div>

            <div className="flex flex-row flex-wrap items-center justify-end gap-3">
              <Button
                type="submit"
                variant="success"
                disabled={tokenLoading || token.trim() === ""}
                title="Simpan & uji koneksi"
                aria-label="Simpan dan uji koneksi"
              >
                {tokenLoading ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Save aria-hidden />
                )}
                {tokenLoading ? "Menguji..." : "Simpan & uji koneksi"}
              </Button>
            </div>
          </form>

          {tokenNotice && <Message tone="neutral">{tokenNotice}</Message>}

          {adaToken && tokenState === "idle" && (
            <Message tone="neutral">
              Token sudah tersimpan. Tempel token baru di kolom di atas bila
              sesi Monev mati (login ulang di portal dulu).
            </Message>
          )}

          {tokenMsg && (
            <Message
              tone={
                tokenState === "ok"
                  ? "good"
                  : tokenState === "idle"
                    ? "neutral"
                    : "bad"
              }
            >
              {tokenMsg}
            </Message>
          )}

          {/* Masa berlaku hanya bila bisa dibaca dari token (bukan tebakan).
              Memberi tahu kapan perlu login ulang, tanpa alarm palsu. */}
          {tokenState === "ok" && tokenHari !== null && (
            <p className="text-xs text-foreground/70">
              {tokenHari > 0
                ? `Perkiraan sesi ini berlaku sekitar ${tokenHari} hari lagi.`
                : "Token ini tampaknya sudah mendekati kedaluwarsa."}
            </p>
          )}

          {/* Panduan rinci sengaja ditutup secara bawaan: pengguna awam cukup
              ikut langkah-langkah di atas. Pola <details>/<summary> native
              dipakai agar bisa dibuka-tutup tanpa JS dan tetap ramah keyboard,
              sama seperti FAQ di beranda. */}
          <details className="rounded-base border-2 border-border bg-background p-3">
            <summary className="cursor-pointer list-none font-medium text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
              Buka DevTools dan ambil token (langkah rinci)
            </summary>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>
                Di halaman portal yang sudah login, tekan{" "}
                <kbd className="rounded-base border-2 border-border bg-secondary-background px-1 font-mono text-xs">
                  F12
                </kbd>{" "}
                (atau{" "}
                <kbd className="rounded-base border-2 border-border bg-secondary-background px-1 font-mono text-xs">
                  Ctrl+Shift+I
                </kbd>
                , di Mac{" "}
                <kbd className="rounded-base border-2 border-border bg-secondary-background px-1 font-mono text-xs">
                  Cmd+Option+I
                </kbd>
                ) untuk membuka DevTools. Bisa juga klik kanan &rarr;{" "}
                <em>Inspect</em>.
              </li>
              <li>
                Pada deretan tab di atas, pilih <strong>Application</strong> (di
                Safari: <em>Storage</em>).
              </li>
              <li>
                Di panel kiri, buka <strong>Storage</strong> &rarr;{" "}
                <strong>Cookies</strong>, lalu klik domain{" "}
                <code>monev.maganghub.kemnaker.go.id</code>.
              </li>
              <li>
                Centang <strong>Show URL-decoded</strong> di kotak pencarian
                (bila ada) agar nilainya terbaca utuh, bukan bentuk{" "}
                <code>%2E</code>.
              </li>
              <li>
                Cari baris bernama <code>monev_refresh_token</code>, lalu{" "}
                <strong>salin hanya isi kolom Value-nya</strong> — jangan ikut
                nama cookie atau baris lain.
              </li>
              <li>
                Kembali ke halaman ini, tempel di kartu{" "}
                <strong>Hubungkan sesi Monev</strong>, lalu simpan.
              </li>
            </ol>
            <p className="mt-2 text-xs text-foreground/70">
              Token ini setara sesi login Anda (berlaku sekitar 30 hari). Jangan
              bagikan ke siapa pun.
            </p>
          </details>

          <Link
            href="/panduan/ambil-token-monev-devtools"
            className="inline-block font-medium text-foreground underline underline-offset-4 hover:opacity-80"
          >
            Panduan bergambar: ambil token dengan DevTools
          </Link>
        </CardContent>

        </details>
      </Card>


      <ConfirmDialog
        open={confirmHapusOpen}
        onOpenChange={setConfirmHapusOpen}
        title="Hapus kredensial Monev?"
        description="Email & password Monev yang tersimpan akan dihapus, dan sesi Monev ikut terputus. Absensi otomatis tidak bisa jalan sampai Anda mengisinya kembali."
        confirmLabel="Hapus kredensial"
        confirmVariant="danger"
        onConfirm={() => void hapus()}
      />
    </div>
  );
}
