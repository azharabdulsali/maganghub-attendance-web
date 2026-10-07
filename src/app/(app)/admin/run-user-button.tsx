"use client";

// src/app/(app)/admin/run-user-button.tsx: tombol "Jalankan" per pengguna.
//
// Memaksa jalankan otomasi seorang pengguna lewat POST /api/admin/dispatch/user.
// Server tetap penentu: ia yang memeriksa sesi, role, sasaran, dan kebijakan
// laporan. Klien hanya mengirim userId (id, bukan rahasia) lalu menampilkan
// ringkasan singkat. Setelah sukses, halaman di-refresh agar kolom "Hari ini"
// memperbarui status.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type RunResponse = {
  ok: true;
  kind: string;
  label: string;
  succeeded: boolean;
  message: string;
};

export function RunUserButton({
  userId,
  name,
}: {
  userId: string;
  /** Label untuk pesan toast (nama atau email). */
  name: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json()) as RunResponse | { error?: string };
      if (!res.ok) {
        toast.error(
          "Tidak bisa menjalankan",
          (data as { error?: string }).error ?? "Permintaan gagal.",
        );
        return;
      }
      const r = data as RunResponse;
      if (r.succeeded) {
        toast.success(`Otomasi ${name} dijalankan`, r.label);
      } else {
        toast.error(`Otomasi ${name}: ${r.label}`, r.message);
      }
      // Muat ulang data server agar kolom "Hari ini" langsung memperbarui.
      router.refresh();
    } catch {
      toast.error("Tidak bisa menjalankan", "Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      // Hijau (success) menandai aksi "jalankan/aktifkan" — beda dari
      // Atur ulang (netral) dan Hapus (merah) di kolom Aksi yang sama.
      variant="success"
      size="icon-sm"
      onClick={run}
      disabled={busy}
      title={`Jalankan otomasi ${name} sekarang`}
      aria-label={`Jalankan otomasi ${name} sekarang`}
    >
      {busy ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Play aria-hidden />
      )}
    </Button>
  );
}
