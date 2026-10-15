"use client";

// src/app/(app)/admin/test-login-button.tsx: tombol "Uji Login" per pengguna.
//
// Menjalankan alur login portal Monev untuk seorang pengguna TANPA mengirim
// laporan, lewat POST /api/admin/users/[id]/test-login. Berguna untuk
// membuktikan kredensial masih hidup sebelum menunggu otomasi berjalan.
//
// Server tetap penentu: ia yang memeriksa sesi, role, sasaran, dan menjalankan
// login. Klien hanya mengirim id (bukan rahasia) lalu menampilkan ringkasan
// singkat. Setelah selesai, halaman di-refresh agar kolom "Kredensial"
// memperbarui status.

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type TestLoginResponse = {
  ok: boolean;
  status: string;
  message: string;
};

export function TestLoginButton({
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
      const res = await fetch(`/api/admin/users/${userId}/test-login`, {
        method: "POST",
      });
      const data = (await res.json()) as TestLoginResponse | { error?: string };
      if (!res.ok) {
        toast.error(
          "Uji login gagal dijalankan",
          (data as { error?: string }).error ?? "Permintaan gagal.",
        );
        return;
      }
      const r = data as TestLoginResponse;
      if (r.ok) {
        toast.success(`Login ${name} berhasil`, r.message);
      } else {
        toast.error(`Login ${name} gagal`, r.message);
      }
      // Muat ulang data server agar kolom "Kredensial" memperbarui status.
      router.refresh();
    } catch {
      toast.error("Uji login gagal", "Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      // Biru utama (`default`): kolom Aksi sudah memakai hijau (Jalankan),
      // netral (Atur ulang), dan merah (Hapus). `neutral` di sini bentrok
      // dengan "Atur ulang", jadi pakai `default` agar keempat tombol
      // terbedakan — tetap berbayangan + animasi tekan.
      variant="default"
      size="icon-sm"
      onClick={run}
      disabled={busy}
      title={`Uji login ${name} ke portal (tanpa kirim laporan)`}
      aria-label={`Uji login ${name} ke portal`}
    >
      {busy ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <KeyRound aria-hidden />
      )}
    </Button>
  );
}
