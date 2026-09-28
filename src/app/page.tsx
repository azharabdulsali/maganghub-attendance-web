import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="mb-3 text-4xl font-heading sm:text-5xl">
        Maganghub Autoabsen
      </h1>
      <p className="mb-8 text-base text-foreground/80 sm:text-lg">
        Kirim absensi MagangHub dari tiga template laporan Anda — tanpa perlu
        menyalakan komputer, tanpa biaya bulanan.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" render={<Link href="/register" />}>
          Daftar
        </Button>
        <Button size="lg" variant="neutral" render={<Link href="/login" />}>
          Masuk
        </Button>
      </div>
    </main>
  );
}