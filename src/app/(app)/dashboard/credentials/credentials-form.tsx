"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  hasExisting: boolean;
  existingEmail: string | null;
  existingStatus: string | null;
  updatedAt: string | null;
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

  // Kalau sudah ada kredensial, form disembunyikan dulu — supaya tidak
  // sengaja/tidak sengaja menimpa password yang sudah benar.
  const [mode, setMode] = useState<"lihat" | "isi">(
    hasExisting ? "lihat" : "isi",
  );

  const [emailMonev, setEmailMonev] = useState(existingEmail ?? "");
  const [passwordMonev, setPasswordMonev] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // --- Tes Koneksi (docs/MONEV-API.md §6) ---
  const [token, setToken] = useState("");
  const [tokenMsg, setTokenMsg] = useState<string | null>(null);
  const [tokenState, setTokenState] = useState<
    "idle" | "ok" | "invalid" | "error"
  >("idle");
  const [tokenLoading, setTokenLoading] = useState(false);

  // --- Login otomatis (Opsi A — docs/MONEV-API.md §7) ---
  const [loginMsg, setLoginMsg] = useState<string | null>(null);
  const [loginState, setLoginState] = useState<
    "idle" | "ok" | "rejected" | "error"
  >("idle");
  const [loginLoading, setLoginLoading] = useState(false);

  async function loginOtomatis() {
    setLoginMsg(null);
    setLoginState("idle");
    setLoginLoading(true);

    try {
      const res = await fetch("/api/credentials/login", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setLoginState("error");
        setLoginMsg(data.error ?? "Login otomatis gagal dijalankan.");
        return;
      }

      if (data.status === "ACTIVE") {
        setLoginState("ok");
        setLoginMsg(data.message ?? "Login otomatis berhasil.");
        router.refresh();
      } else if (data.status === "REJECTED") {
        setLoginState("rejected");
        setLoginMsg(
          data.message ??
            "Portal menolak login. Periksa email & password Monev Anda.",
        );
        router.refresh();
      } else {
        setLoginState("error");
        setLoginMsg(
          data.message ??
            "Login otomatis belum bisa memastikan hasilnya. Coba lagi, atau pakai tempel token.",
        );
      }
    } catch {
      setLoginState("error");
      setLoginMsg("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function tesKoneksi(denganToken: boolean) {
    setTokenMsg(null);
    setTokenState("idle");
    setTokenLoading(true);

    try {
      const res = await fetch("/api/credentials/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(denganToken ? { token } : {}),
      });

      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setTokenState("error");
        setTokenMsg(data.error ?? "Tes koneksi gagal dijalankan.");
        return;
      }

      if (data.status === "ACTIVE") {
        setTokenState("ok");
        setTokenMsg(data.message ?? "Sesi Monev aktif.");
        setToken(""); // jangan biarkan token tertinggal di state
        router.refresh();
      } else if (data.status === "INVALID") {
        setTokenState("invalid");
        setTokenMsg(data.message ?? "Sesi Monev tidak valid.");
        router.refresh();
      } else {
        setTokenState("error");
        setTokenMsg(data.message ?? "Tidak dapat memastikan status sesi.");
      }
    } catch {
      setTokenState("error");
      setTokenMsg("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setTokenLoading(false);
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
        setError(data.error ?? "Gagal menyimpan kredensial");
        return;
      }

      setPasswordMonev(""); // jangan biarkan password tertinggal di state
      setSukses("Kredensial berhasil disimpan (terenkripsi).");
      setMode("lihat");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }

  async function hapus() {
    if (!confirm("Hapus kredensial Monev yang tersimpan?")) return;

    setError(null);
    setSukses(null);
    setLoading(true);

    try {
      const res = await fetch("/api/credentials", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Gagal menghapus kredensial");
        return;
      }

      setEmailMonev("");
      setSukses("Kredensial dihapus.");
      setMode("isi");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {sukses && (
        <p className="rounded-base border-2 border-border bg-main px-3 py-2 text-sm text-main-foreground">
          {sukses}
        </p>
      )}

      {error && (
        <p className="rounded-base border-2 border-border bg-background px-3 py-2 text-sm text-foreground">
          {error}
        </p>
      )}

      {mode === "lihat" ? (
        <Card>
          <CardHeader>
            <CardTitle>Kredensial tersimpan</CardTitle>
            <CardDescription>
              Password tidak bisa ditampilkan kembali — hanya bisa diganti.
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
                  <span className="inline-flex items-center rounded-base border-2 border-border bg-secondary-background px-3 py-1 text-xs font-heading">
                    {existingStatus ?? "-"}
                  </span>
                </dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <dt className="font-heading sm:w-40">Terakhir diubah</dt>
                <dd className="text-foreground/80">{formatTanggal(updatedAt)}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => setMode("isi")} disabled={loading}>
                Ganti kredensial
              </Button>
              <Button variant="neutral" onClick={hapus} disabled={loading}>
                Hapus
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {hasExisting ? "Ganti kredensial" : "Isi kredensial"}
            </CardTitle>
            <CardDescription>
              Password disimpan terenkripsi (AES-256-GCM) dan tidak bisa dibaca
              kembali.
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
                <Input
                  id="passwordMonev"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={passwordMonev}
                  onChange={(e) => setPasswordMonev(e.target.value)}
                  placeholder="Password portal Maganghub"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="submit" disabled={loading}>
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
                  >
                    Batal
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Login otomatis — jalur utama (Opsi A, docs/MONEV-API.md §7). Server
          yang login ke SSO memakai kredensial tersimpan; pengguna tidak perlu
          menyentuh DevTools. Hanya menyimpan sesi, tidak mengirim laporan. */}
      <Card>
        <CardHeader>
          <CardTitle>Hubungkan sesi Monev</CardTitle>
          <CardDescription>
            Cara mudah: cukup klik tombol di bawah. Kami akan login ke portal
            memakai email &amp; password yang tersimpan, lalu menyimpan sesinya
            secara terenkripsi. Tidak ada laporan yang dikirim.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={loginOtomatis} disabled={loginLoading || !hasExisting}>
            {loginLoading ? "Menghubungkan..." : "Login otomatis"}
          </Button>

          {!hasExisting && (
            <p className="text-xs text-foreground/70">
              Isi email &amp; password Monev terlebih dahulu di kartu atas,
              lalu kembali ke sini.
            </p>
          )}

          {loginMsg && (
            <p
              className={
                "rounded-base border-2 border-border px-3 py-2 text-sm " +
                (loginState === "ok"
                  ? "bg-main text-main-foreground"
                  : "bg-background text-foreground")
              }
            >
              {loginMsg}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tes Koneksi — docs/MONEV-API.md §6. Hanya memeriksa sesi, tidak pernah
          mengirim laporan (SPEC.md §10). */}
      <Card>
        <CardHeader>
          <CardTitle>Cara cadangan: tempel token sesi</CardTitle>
          <CardDescription>
            Pakai ini bila login otomatis tidak berhasil. Tempel token sesi
            dari portal — kami hanya memeriksa apakah sesi masih hidup, tidak
            ada laporan yang dikirim.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="monevToken">
              Token sesi Monev (<code>monev_refresh_token</code>)
            </Label>
            <Input
              id="monevToken"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJ... (tempel dari DevTools)"
            />
            <p className="text-xs text-foreground/70">
              Cara ambil: buka portal Monev yang sudah login → DevTools →
              Application → Cookies → salin nilai <code>monev_refresh_token</code>.
              Token disimpan terenkripsi dan tidak bisa ditampilkan kembali.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => tesKoneksi(true)}
              disabled={tokenLoading || token.trim().length === 0}
            >
              {tokenLoading ? "Memeriksa..." : "Simpan & tes"}
            </Button>
            {hasToken && (
              <Button
                variant="neutral"
                onClick={() => tesKoneksi(false)}
                disabled={tokenLoading}
              >
                Tes ulang token tersimpan
              </Button>
            )}
          </div>

          {hasToken && tokenState === "idle" && !tokenMsg && (
            <p className="text-xs text-foreground/70">
              Sudah ada token tersimpan. Gunakan &quot;Tes ulang&quot; untuk
              memeriksa, atau tempel token baru untuk mengganti.
            </p>
          )}

          {tokenMsg && (
            <p
              className={
                "rounded-base border-2 border-border px-3 py-2 text-sm " +
                (tokenState === "ok"
                  ? "bg-main text-main-foreground"
                  : "bg-background text-foreground")
              }
            >
              {tokenMsg}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
