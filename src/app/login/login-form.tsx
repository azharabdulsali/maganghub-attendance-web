"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const justRegistered = params.get("registered") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        setError(
          `Server tidak memberi CSRF token. Pastikan server dev berjalan ` +
            `(npm run dev) dan buka ${location.origin}`,
        );
        return;
      }
      csrfToken = token;
    } catch (csrfError) {
      console.error("Gagal mengambil CSRF token:", csrfError);
      setError(
        `Gagal menghubungi /api/auth/csrf. Detail: ${
          csrfError instanceof Error ? csrfError.message : String(csrfError)
        }`,
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
      });

      const data = (await res.json().catch(() => ({}))) as { url?: string };
      const target = data.url ?? "/dashboard";

      if (!res.ok || /[?&]error=/.test(target)) {
        setError("Email atau password salah");
        return;
      }

      router.push(target);
      router.refresh();
    } catch (fetchError) {
      console.error("Gagal login:", fetchError);
      setError(
        `Gagal menghubungi server login. Detail: ${
          fetchError instanceof Error ? fetchError.message : String(fetchError)
        } (alamat: ${location.origin})`,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Masuk</h1>
      <p className="mb-8 text-sm text-slate-600">
        MagangHub Attendance
      </p>

      {justRegistered && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Akun berhasil dibuat. Silakan masuk.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Belum punya akun?{" "}
        <Link href="/register" className="font-medium text-slate-900 underline">
          Daftar
        </Link>
      </p>
    </main>
  );
}

async function getCsrfToken(): Promise<string> {
  const res = await fetch("/api/auth/csrf");
  const data = (await res.json()) as { csrfToken: string };
  return data.csrfToken;
}
