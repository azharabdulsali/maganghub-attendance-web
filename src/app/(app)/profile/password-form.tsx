"use client";

// src/app/(app)/profile/password-form.tsx — form ubah kata sandi (C-13).
//
// Diubah dalam sesi (pengguna sudah login); tidak ada email/token reset. Tiga
// kolom: kata sandi saat ini, kata sandi baru, dan konfirmasi. Pemeriksaan di
// klien hanya untuk kenyamanan; server memvalidasi ulang dengan skema yang sama
// (`changePasswordSchema`). Setelah sukses, kolom dikosongkan.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import { useToast } from "@/components/ui/toast";

const MIN_PASSWORD = 8;

export default function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const toast = useToast();

  const terlaluPendek = next.length > 0 && next.length < MIN_PASSWORD;
  const tidakCocok = confirm.length > 0 && next !== confirm;
  const samaDenganLama = next.length > 0 && next === current;
  const lengkap =
    current.length > 0 && next.length >= MIN_PASSWORD && next === confirm;

  async function simpan() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        const pesan = data?.error ?? "Gagal mengubah kata sandi";
        setError(pesan);
        toast.error("Gagal mengubah kata sandi", pesan);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setSaved(true);
      toast.success("Kata sandi diubah", "Gunakan kata sandi baru saat login berikutnya.");
    } catch {
      const pesan = "Tidak bisa menghubungi server. Coba lagi.";
      setError(pesan);
      toast.error("Gagal mengubah kata sandi", pesan);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (lengkap && !samaDenganLama) void simpan();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">Kata sandi saat ini</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          placeholder="••••••••"
          onChange={(e) => {
            setCurrent(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">Kata sandi baru</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          placeholder="Minimal 8 karakter"
          onChange={(e) => {
            setNext(e.target.value);
            setSaved(false);
          }}
        />
        {terlaluPendek && (
          <p className="text-xs text-destructive">
            Kata sandi baru minimal {MIN_PASSWORD} karakter.
          </p>
        )}
        {samaDenganLama && (
          <p className="text-xs text-destructive">
            Kata sandi baru harus berbeda dari yang lama.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">Konfirmasi kata sandi baru</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          placeholder="Ulangi kata sandi baru"
          onChange={(e) => {
            setConfirm(e.target.value);
            setSaved(false);
          }}
        />
        {tidakCocok && (
          <p className="text-xs text-destructive">
            Konfirmasi tidak cocok dengan kata sandi baru.
          </p>
        )}
      </div>

      {error && <Message tone="bad">{error}</Message>}
      {saved && <Message tone="good">Kata sandi berhasil diubah.</Message>}

      <div>
        <Button type="submit" disabled={saving || !lengkap || samaDenganLama}>
          {saving ? "Menyimpan..." : "Ubah kata sandi"}
        </Button>
      </div>
    </form>
  );
}
