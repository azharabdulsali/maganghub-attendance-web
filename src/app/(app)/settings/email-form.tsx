"use client";

// src/app/(app)/settings/email-form.tsx: form ubah email akun (paling sensitif).
//
// Email adalah identitas login, jadi form ini sengaja berbeda dari form lain:
//   - Wajib mengisi kata sandi saat ini (pembuktian pemilik akun).
//   - Ada peringatan eksplisit bahwa TIDAK ada verifikasi email, salah ketik =
//     terkunci permanen, karena tidak ada alur pemulihan akun.
//   - Setelah sukses, sesi diperbarui via `useSession().update({ email, ... })`
//     supaya sidebar & sesi tidak menampilkan email lama.
//
// Pemeriksaan di klien hanya untuk kenyamanan; server memvalidasi ulang dengan
// skema yang sama (`changeEmailSchema`) dan menegakkan guard eskalasi peran.

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { Message } from "@/components/ui/message";
import { useToast } from "@/components/ui/toast";

// Cek bentuk email sederhana di klien, sengaja longgar (server tetap otoritatif).
const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const { update } = useSession();

  const emailDiisi = email.trim().length > 0;
  const emailValid = !emailDiisi || POLA_EMAIL.test(email.trim());
  const samaDenganSekarang =
    emailDiisi && email.trim().toLowerCase() === currentEmail.toLowerCase();
  const lengkap =
    emailDiisi && emailValid && !samaDenganSekarang && password.length > 0;

  async function simpan() {
    setSaving(true);
    setError(null);
    setFieldError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEmail: email.trim(),
          currentPassword: password,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            email?: string;
            sessionVersion?: number;
            field?: string;
          }
        | null;
      if (!res.ok) {
        const pesan = data?.error ?? "Gagal mengubah email";
        // Error pada kolom email ditampilkan di kolom itu; sisanya sebagai pesan
        // umum. Ini memudahkan pengguna menemukan penyebabnya.
        if (data?.field === "newEmail") {
          setFieldError(pesan);
        } else {
          setError(pesan);
        }
        toast.error("Gagal mengubah email", pesan);
        return;
      }

      // Sampai sini server SUDAH mengubah email dan mencabut sesi lain, titik
      // ini adalah batas sukses yang otoritatif. Sinkronisasi sesi klien di
      // bawah bersifat "best effort" dan SENGAJA dipisah dari `catch` utama:
      // kalau `update()` gagal (mis. jaringan putus), email tetap sudah
      // berubah, jadi keliru bila kita bilang "gagal mengubah email" lalu
      // menyuruh pengguna mencoba lagi.
      setEmail("");
      setPassword("");
      setSaved(true);

      try {
        await update({
          email: data?.email,
          sessionVersion: data?.sessionVersion,
        });
        toast.success(
          "Email diubah",
          "Perangkat lain telah dikeluarkan. Gunakan email baru saat login berikutnya.",
        );
      } catch {
        // Kegagalan di sini hanya berarti tampilan sesi (sidebar) mungkin masih
        // memuat email lama sampai dimuat ulang, bukan kegagalan perubahan.
        toast.success("Email diubah", "Muat ulang halaman untuk menyegarkan sesi.");
      }
    } catch {
      const pesan = "Tidak bisa menghubungi server. Coba lagi.";
      setError(pesan);
      toast.error("Gagal mengubah email", pesan);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (lengkap) void simpan();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-email">Email baru</Label>
        <Input
          id="new-email"
          type="email"
          autoComplete="email"
          value={email}
          placeholder="nama@contoh.com"
          aria-invalid={
            (emailDiisi && !emailValid) ||
            fieldError !== null ||
            samaDenganSekarang
          }
          aria-describedby={
            emailDiisi && !emailValid
              ? "new-email-invalid"
              : samaDenganSekarang
                ? "new-email-same"
                : fieldError
                  ? "new-email-error"
                  : undefined
          }
          onChange={(e) => {
            setEmail(e.target.value);
            setSaved(false);
            setFieldError(null);
          }}
        />
        {emailDiisi && !emailValid && (
          <FieldError id="new-email-invalid">
            Format email tidak valid.
          </FieldError>
        )}
        {samaDenganSekarang && (
          <FieldError id="new-email-same">
            Email baru sama dengan email saat ini.
          </FieldError>
        )}
        {fieldError && (
          <FieldError id="new-email-error">{fieldError}</FieldError>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email-current-password">Kata sandi saat ini</Label>
        <PasswordInput
          id="email-current-password"
          autoComplete="current-password"
          value={password}
          placeholder="••••••••"
          aria-invalid={error !== null && password.length === 0}
          onChange={(e) => {
            setPassword(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      {error && <Message tone="bad">{error}</Message>}
      {saved && (
        <Message tone="good">
          Email berhasil diubah. Semua perangkat lain telah dikeluarkan.
        </Message>
      )}

      <Message tone="neutral" role={undefined} aria-live={undefined}>
        Aplikasi ini <strong>tidak mengirim email verifikasi</strong>. Jika Anda
        salah mengetik, Anda bisa kehilangan akses ke akun ini secara permanen,
        tidak ada pemulihan akun. Pastikan alamatnya benar sebelum menyimpan.
      </Message>

      {/* Tombol aksi rata kanan (lihat catatan di profile-form.tsx). */}
      <div className="flex flex-row items-center justify-end gap-3">
        <Button
          type="submit"
          variant="success"
          disabled={saving || !lengkap}
          title={saving ? "Menyimpan…" : "Ubah email"}
          aria-label={saving ? "Menyimpan email" : "Ubah email"}
        >
          {saving ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Mail aria-hidden />
          )}
          {saving ? "Menyimpan..." : "Ubah email"}
        </Button>
      </div>
    </form>
  );
}
