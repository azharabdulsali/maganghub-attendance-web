import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginForm from "./login-form";

// Halaman utilitas: tidak memberi nilai pencarian, jadi `noindex` (audit T-4).
export const metadata: Metadata = {
  title: "Masuk",
  robots: { index: false, follow: false },
};

// useSearchParams() di dalam LoginForm memerlukan Suspense boundary,
// kalau tidak halaman ini gagal di-prerender oleh Next.js saat build.
export default async function LoginPage() {
  // Pengguna yang sudah masuk tidak perlu melihat form ini lagi. Tanpa
  // pengalihan, ia bisa mengira sesinya hilang lalu memasukkan sandi ulang
  // (atau, lebih buruk, mendaftar akun kedua).
  if ((await auth())?.user) redirect("/dashboard");

  return (
    <Suspense
      fallback={
        <main className="pt-safe pb-safe pl-safe pr-safe mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-6">
          <p className="text-sm text-muted-foreground">Memuat…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
