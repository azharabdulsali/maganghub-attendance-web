// src/app/(app)/work-schedule/page.tsx: halaman jadwal kerja mingguan.
//
// Server component: memeriksa sesi, membaca jadwal pengguna (gagal-lunak →
// default Senin–Jumat), lalu menyerahkan penyuntingan ke form klien.
//
// Kenapa jadwal ini penting: keputusan kirim (`decide()` di report-policy.ts),
// kalender, pemilih tanggal, pengingat "belum absen", dan panel admin semuanya
// membaca jadwal yang SAMA. Satu halaman ini adalah satu-satunya tempat
// mengubahnya.

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { loadWorkScheduleState } from "@/lib/work-schedule-repo";
import { PageHeader } from "@/components/page-header";
import WorkScheduleForm from "./work-schedule-form";

export default async function WorkSchedulePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // `exists` dipakai form untuk membedakan "belum pernah diatur" dari "memang
  // memilih Senin–Jumat", tanpa membuat pengguna bingung melihat centang yang
  // ia tidak pernah mencentang sendiri.
  const state = await loadWorkScheduleState(session.user.id);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title="Jadwal Kerja"
        description="Tentukan hari kerja Anda. Absensi otomatis, kalender, dan pemilih tanggal mengikuti jadwal ini."
      />

      <WorkScheduleForm initialDays={state.days} hasExisting={state.exists} />
    </div>
  );
}
