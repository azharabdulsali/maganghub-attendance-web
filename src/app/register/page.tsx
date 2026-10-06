"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { Message } from "@/components/ui/message";
import { hitungKekuatan } from "@/lib/password-strength";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  // `konfirmasiTersentuh` mencegah error "tidak cocok" muncul sejak halaman
  // dibuka (kolom konfirmasi masih kosong, padahal pengguna belum mengisi apa
  // pun). Baru setelah pengguna mengetik di kolom itu, ketidakcocokan
  // ditampilkan — dan tetap ditampilkan sambil ia mengetik sampai cocok.
  const [konfirmasiTersentuh, setKonfirmasiTersentuh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const kekuatan = hitungKekuatan(password);

  const tidakCocok = konfirmasiTersentuh && konfirmasi !== password;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Gerbang konfirmasi: murni mencegah salah ketik, BUKAN kontrol keamanan
    // (nilai `password` tetap divalidasi & di-hash di server). Karena itu
    // `konfirmasi` tidak pernah dikirim ke /api/register.
    if (konfirmasi !== password) {
      setKonfirmasiTersentuh(true);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Pendaftaran gagal");
        return;
      }

      router.push("/login?registered=1");
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pt-safe pb-safe pl-safe pr-safe mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Daftar akun</CardTitle>
          <CardDescription>
            MagangHub Autoabsen, absensi otomatis dari template laporan Anda.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nama</Label>
              <Input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama lengkap"
                aria-invalid={error !== null}
                aria-describedby={error ? "register-error" : undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@contoh.com"
                aria-invalid={error !== null}
                aria-describedby={error ? "register-error" : undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                required
                minLength={8}
                // `new-password` WAJIB ada di KEDUA kolom kata sandi (di sini
                // dan di kolom konfirmasi di bawah). Kalau hanya kolom
                // konfirmasi yang menandai diri sebagai "kata sandi baru",
                // pengelola kata sandi browser menyimpulkan kolom itulah
                // targetnya, sehingga saran kata sandi muncul di kolom
                // KONFIRMASI alih-alih di kolom Password utama.
                // Sejajar dengan src/app/(app)/settings/password-form.tsx.
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                aria-invalid={error !== null}
                aria-describedby={error ? "register-error" : undefined}
              />
              <PasswordStrength
                skor={kekuatan.skor}
                level={kekuatan.level}
                saran={kekuatan.saran}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="konfirmasi-password">Konfirmasi password</Label>
              <PasswordInput
                id="konfirmasi-password"
                required
                // Sengaja TANPA `minLength`: panjang adalah aturan kolom
                // password (ditegakkan server), sedangkan kolom ini hanya
                // memeriksa kecocokan. Kalau `minLength` ada di sini, browser
                // akan memblokir submit dengan pesan "minimal 8 karakter" saat
                // masalah sebenarnya adalah ketidakcocokan — menyesatkan.
                //
                // `new-password` (bukan `off`): pengelola kata sandi akan
                // menawarkan membuat kata sandi BARU dan mengisi KEDUA kolom
                // (kolom Password utama di atas juga ber-`new-password`),
                // bukan mengisi kolom ini dengan kata sandi lama.
                autoComplete="new-password"
                value={konfirmasi}
                onChange={(e) => {
                  setKonfirmasi(e.target.value);
                  setKonfirmasiTersentuh(true);
                }}
                placeholder="Ulangi password"
                aria-invalid={tidakCocok || error !== null}
                aria-describedby={
                  tidakCocok
                    ? "konfirmasi-error"
                    : error
                      ? "register-error"
                      : undefined
                }
              />
              {tidakCocok && (
                <FieldError id="konfirmasi-error">
                  Konfirmasi tidak cocok dengan password.
                </FieldError>
              )}
            </div>

            {error && (
              <Message tone="bad" id="register-error">
                {error}
              </Message>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              variant="success"
              title={loading ? "Memproses…" : "Daftar"}
              aria-label={loading ? "Memproses pendaftaran" : "Daftar"}
            >
              {loading ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <UserPlus aria-hidden />
              )}
              {loading ? "Memproses..." : "Daftar"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm">
            Sudah punya akun?{" "}
            <Link href="/login" className="font-heading underline">
              Masuk
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
