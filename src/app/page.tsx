import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <h1 className="mb-2 text-3xl font-semibold text-slate-900">
        MagangHub Attendance
      </h1>
      <p className="mb-8 text-slate-600">
        Kirim absensi MagangHub dari tiga template laporan Anda — tanpa perlu
        menyalakan komputer, tanpa biaya bulanan.
      </p>

      <div className="flex gap-3">
        <Link
          href="/register"
          className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Daftar
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Masuk
        </Link>
      </div>
    </main>
  );
}
