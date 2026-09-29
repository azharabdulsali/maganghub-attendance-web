"use client";

// src/app/(app)/profile/profile-form.tsx — form ubah nama profil.
//
// Sederhana dengan sengaja: hanya `name` yang bisa diubah. Email & peran
// ditampilkan sebagai informasi (read-only) karena keduanya bukan wewenang
// pengguna. Pemeriksaan panjang di klien hanya untuk kenyamanan; server tetap
// memvalidasi ulang dengan skema yang sama (AGENTS.md §2, §9 poin 5).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_NAME = 80;

export default function ProfileForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const terlaluPanjang = name.trim().length > MAX_NAME;
  const berubah = name.trim() !== initialName.trim();

  async function simpan() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        setError(data?.error ?? "Gagal menyimpan profil");
        return;
      }
      setSaved(true);
    } catch {
      setError("Tidak bisa menghubungi server. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!terlaluPanjang) void simpan();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Nama tampilan</Label>
        <Input
          id="profile-name"
          value={name}
          maxLength={MAX_NAME}
          placeholder="Nama Anda"
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
        <p className="text-xs text-foreground/60">
          Dipakai untuk menyapa Anda di aplikasi. Boleh dikosongkan.
        </p>
      </div>

      {terlaluPanjang && (
        <p className="text-sm text-destructive">
          Nama maksimal {MAX_NAME} karakter.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && (
        <p className="text-sm text-foreground/80">✅ Profil tersimpan.</p>
      )}

      <div>
        <Button type="submit" disabled={saving || terlaluPanjang || !berubah}>
          {saving ? "Menyimpan..." : "Simpan nama"}
        </Button>
      </div>
    </form>
  );
}
