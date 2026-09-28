import { Suspense } from "react";
import LoginForm from "./login-form";

// useSearchParams() di dalam LoginForm memerlukan Suspense boundary,
// kalau tidak halaman ini gagal di-prerender oleh Next.js saat build.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
          <p className="text-sm text-slate-500">Memuat…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
