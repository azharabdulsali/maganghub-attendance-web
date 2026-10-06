"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import { useToast } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { kodeErrorDari, pesanUntukKode } from "@/lib/login-messages";

export default function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const justRegistered = params.get("registered") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Tampilkan kegagalan login di DUA tempat sekaligus:
   *   - toast: selalu terlihat, tidak bisa terlewat (mis. saat keyboard terbuka
   *     atau halaman sudah digulir), dan dibacakan pembaca layar lewat `role`.
   *   - kotak inline di atas tombol: menempel pada form, tetap ada selama
   *     pengguna memperbaiki isian.
   *
   * Sebelumnya hanya ada kotak inline — dan pada jalur redirect tidak pernah
   * muncul karena `fetch` mengikuti 302 ke `/login?error=...` (HTML), sehingga
   * `res.ok` true dan `target` jatuh ke `/dashboard`: tidak ada pesan, lalu
   * `router.push` memantul balik ke login tanpa penjelasan.
   */
  function gagal(kode: string | null) {
    const { judul, detail } = pesanUntukKode(kode);
    setError(detail);
    toast.error(judul, detail);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Ambil CSRF token DI LUAR try utama, supaya kalau gagal kita tahu
    // persis bahwa masalahnya di tahap ini (bukan di tahap login).
    let csrfToken: string;
    try {
      const token = await getCsrfToken();
      if (!token) {
        setError("Halaman tidak siap menerima login. Muat ulang halaman ini.");
        toast.error(
          "Halaman perlu dimuat ulang",
          "Muat ulang halaman ini, lalu coba masuk lagi.",
        );
        return;
      }
      csrfToken = token;
    } catch (csrfError) {
      console.error("Gagal mengambil CSRF token:", csrfError);
      setError("Tidak bisa menghubungi server login. Periksa koneksi Anda.");
      toast.error(
        "Tidak bisa menghubungi server",
        "Permintaan CSRF gagal. Periksa koneksi lalu muat ulang halaman.",
      );
      return;
    } finally {
      setLoading(false);
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/callback/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email,
          password,
          csrfToken,
          callbackUrl: "/dashboard",
          json: "true",
        }),
        // JANGAN ikuti redirect otomatis. Pada kredensial salah, Auth.js
        // membalas 302 ke `/login?error=CredentialsSignin`. Kalau `fetch`
        // mengikutinya, yang terbaca adalah halaman HTML login (status 200)
        // dan sinyal error hilang. Dengan "manual" kita bisa membaca header
        // `Location` sendiri.
        redirect: "manual",
      });

      // Sumber penanda error, dari paling andal ke paling lemah. Header
      // `Location` dari 302 adalah yang paling eksplisit; `res.url` sebagai
      // cadangan.
      const lokasi = res.headers.get("location") ?? "";
      const kode =
        [lokasi, res.url].map(kodeErrorDari).find((k) => k !== null) ?? null;

      if (kode) {
        gagal(kode);
        return;
      }

      // Tidak ada sinyal error eksplisit. Jangan percaya status saja (mode
      // "manual" bisa menghasilkan status 0 / opaqueredirect yang tak terbaca
      // di sebagian browser). Verifikasi LANGSUNG ke sumber kebenaran: apakah
      // cookie sesi benar-benar terpasang? Ini deterministik dan tahan banting
      // terhadap perbedaan perilaku redirect antar-browser.
      const masuk = await punyaSesi();
      if (!masuk) {
        gagal("CredentialsSignin");
        return;
      }

      toast.success("Berhasil masuk", "Mengalihkan ke dashboard...");
      router.push("/dashboard");
      router.refresh();
    } catch (fetchError) {
      console.error("Gagal login:", fetchError);
      setError("Tidak bisa menghubungi server login. Periksa koneksi Anda.");
      toast.error(
        "Tidak bisa menghubungi server",
        "Permintaan login gagal dikirim. Periksa koneksi lalu coba lagi.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pt-safe pb-safe pl-safe pr-safe mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Masuk</CardTitle>
          <CardDescription>MagangHub Autoabsen</CardDescription>
        </CardHeader>

        <CardContent>
          {justRegistered && (
            <Message tone="good" className="mb-4">
              Akun berhasil dibuat. Silakan masuk.
            </Message>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                aria-invalid={error !== null}
                aria-describedby={error ? "login-error" : undefined}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                required
                value={password}
                aria-invalid={error !== null}
                aria-describedby={error ? "login-error" : undefined}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <Message tone="bad" id="login-error">
                {error}
              </Message>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              variant="success"
              title={loading ? "Memproses…" : "Masuk"}
              aria-label={loading ? "Memproses masuk" : "Masuk"}
            >
              {loading ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <LogIn aria-hidden />
              )}
              {loading ? "Memproses..." : "Masuk"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm">
            Belum punya akun?{" "}
            <Link href="/register" className="font-heading underline">
              Daftar
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}

async function getCsrfToken(): Promise<string> {
  const res = await fetch("/api/auth/csrf");
  const data = (await res.json()) as { csrfToken: string };
  return data.csrfToken;
}

/**
 * Cek apakah cookie sesi sudah benar-benar terpasang setelah POST login.
 *
 * Dipakai sebagai bukti sukses yang tidak bisa dibohongi: `/api/auth/session`
 * membaca cookie HttpOnly dan mengembalikan `{}` (tanpa `user`) bila tidak ada
 * sesi sah. Ini jauh lebih andal daripada menebak dari kode status redirect
 * `fetch` yang perilakunya beda antar-browser. Bila pemeriksaan ini sendiri
 * gagal (jaringan), kita anggap BELUM masuk supaya pengguna melihat pesan,
 * bukan diarahkan diam-diam.
 */
async function punyaSesi(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as
      | { user?: unknown }
      | null;
    return Boolean(data && data.user);
  } catch {
    return false;
  }
}
