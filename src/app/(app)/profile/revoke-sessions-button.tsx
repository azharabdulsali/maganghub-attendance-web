"use client";

// src/app/(app)/profile/revoke-sessions-button.tsx — tombol "keluar dari semua
// perangkat lain" (lanjutan C-13).
//
// Memanggil POST /api/account/sessions/revoke, yang menaikkan
// `User.sessionVersion`. Semua JWT lain langsung tidak sah; sesi perangkat ini
// diperbarui lewat `useSession().update()` agar tidak ikut keluar.
//
// Konfirmasi dua langkah dipakai karena aksi ini mengeluarkan sesi di semua
// perangkat lain dan tidak bisa dibatalkan.

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Message } from "@/components/ui/message";
import { useToast } from "@/components/ui/toast";

export default function RevokeSessionsButton() {
  const { update } = useSession();
  const toast = useToast();
  // idle → konfirmasi → selesai
  const [tahap, setTahap] = useState<"idle" | "konfirmasi" | "selesai">("idle");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function jalankan() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/account/sessions/revoke", {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; sessionVersion?: number }
        | null;
      if (!res.ok) {
        const pesan = data?.error ?? "Gagal mengeluarkan perangkat lain";
        setError(pesan);
        toast.error("Gagal", pesan);
        return;
      }
      // Perbarui sesi perangkat ini ke versi baru supaya tidak ikut keluar.
      if (typeof data?.sessionVersion === "number") {
        await update({ sessionVersion: data.sessionVersion });
      }
      setTahap("selesai");
      toast.success(
        "Perangkat lain dikeluarkan",
        "Sesi di perangkat lain kini tidak berlaku.",
      );
    } catch {
      const pesan = "Tidak bisa menghubungi server. Coba lagi.";
      setError(pesan);
      toast.error("Gagal", pesan);
    } finally {
      setWorking(false);
    }
  }

  if (tahap === "selesai") {
    return (
      <Message tone="good">
        Semua perangkat lain telah dikeluarkan. Perangkat ini tetap masuk.
      </Message>
    );
  }

  if (tahap === "konfirmasi") {
    return (
      <div className="flex flex-col gap-3">
        {error && <Message tone="bad">{error}</Message>}
        <Message tone="bad">
          Semua perangkat lain akan keluar dan harus login ulang. Lanjutkan?
        </Message>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="noShadow"
            disabled={working}
            onClick={() => void jalankan()}
          >
            {working ? "Mengeluarkan..." : "Ya, keluarkan semua"}
          </Button>
          <Button
            type="button"
            variant="neutral"
            disabled={working}
            onClick={() => setTahap("idle")}
          >
            Batal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="neutral"
      onClick={() => setTahap("konfirmasi")}
    >
      Keluar dari semua perangkat lain
    </Button>
  );
}

