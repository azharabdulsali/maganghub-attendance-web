import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import SignOutButton from "./sign-out-button";

// Dashboard — halaman terlindungi. Kalau belum login, langsung dilempar
// ke /login. Ini bukti berhasil Tahap 1 (SPEC.md §12).
export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role ?? "USER";
  const isAdmin = role === "ADMIN";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600">
            Masuk sebagai {session.user.email}
          </p>
        </div>
        <SignOutButton />
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">Peran akun:</span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              isAdmin
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {role}
          </span>
        </div>
        {!env.ADMIN_EMAIL && (
          <p className="mt-3 text-xs text-slate-500">
            Catatan: <code>ADMIN_EMAIL</code> belum diisi, jadi tidak ada admin
            yang dibuat otomatis.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-6">
        <h2 className="mb-2 font-medium text-slate-900">
          Tahap 1 selesai — fondasi siap
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Login, sesi, dan database sudah bekerja. Fitur absensi menyusul pada
          tahap berikutnya.
        </p>
        <ol className="space-y-1 text-sm text-slate-600">
          <li>✅ Skema database tersinkron ke Neon</li>
          <li>⬜ Simpan kredensial Monev (Tahap 2)</li>
          <li>⬜ Isi 3 template laporan (Tahap 2–3)</li>
          <li>⬜ Kirim absensi ke portal (Tahap 4)</li>
        </ol>
      </div>
    </main>
  );
}
