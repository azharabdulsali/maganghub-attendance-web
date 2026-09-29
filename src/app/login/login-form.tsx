"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Masuk</CardTitle>
          <CardDescription>Maganghub Autoabsen</CardDescription>
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
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <Message tone="bad">{error}</Message>}

            <Button type="submit" disabled={loading} className="w-full">
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
