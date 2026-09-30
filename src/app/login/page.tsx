import { Suspense } from "react";
import type { Metadata } from "next";
import LoginForm from "./login-form";

// Halaman utilitas: tidak memberi nilai pencarian, jadi `noindex` (audit T-4).
export const metadata: Metadata = {
  title: "Masuk",
  robots: { index: false, follow: false },
};

// useSearchParams() di dalam LoginForm memerlukan Suspense boundary,
// kalau tidak halaman ini gagal di-prerender oleh Next.js saat build.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="pt-safe pb-safe pl-safe pr-safe mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-6">
          <p className="text-sm text-foreground/60">Memuat…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
