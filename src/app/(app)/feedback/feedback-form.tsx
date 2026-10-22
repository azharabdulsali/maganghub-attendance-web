"use client";

// src/app/(app)/feedback/feedback-form.tsx: form kirim kritik & saran.
//
// Batas panjang & penghitung memakai `countFeedbackLength` dari
// src/lib/feedback.ts, fungsi yang SAMA dengan validasi server, jadi angka di
// layar tidak mungkin berbeda dari yang diterima API.
//
// Setelah sukses: kosongkan kolom, toast, lalu `router.refresh()` supaya
// riwayat di bawah langsung memuat baris baru tanpa refresh manual.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  countFeedbackLength,
} from "@/lib/feedback";

export function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  const panjang = countFeedbackLength(message);
  const terlaluPendek = panjang > 0 && panjang < FEEDBACK_MIN_LENGTH;
  const terlaluPanjang = panjang > FEEDBACK_MAX_LENGTH;
  const lengkap =
    panjang >= FEEDBACK_MIN_LENGTH && panjang <= FEEDBACK_MAX_LENGTH;

  async function kirim() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        const pesan = data?.error ?? "Gagal mengirim masukan.";
        setError(pesan);
        toast.error("Gagal mengirim", pesan);
        return;
      }

      setMessage("");
      toast.success("Masukan terkirim", "Terima kasih. Admin akan membacanya.");
      router.refresh();
    } catch {
      const pesan = "Tidak bisa menghubungi server. Coba lagi.";
      setError(pesan);
      toast.error("Gagal mengirim", pesan);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (lengkap && !saving) void kirim();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feedback-message">Isi kritik atau saran</Label>
        <Textarea
          id="feedback-message"
          rows={5}
          maxLength={FEEDBACK_MAX_LENGTH}
          value={message}
          placeholder="Contoh: tombol kirim laporan sulit ditemukan di layar HP."
          aria-invalid={terlaluPendek || terlaluPanjang || error !== null}
          aria-describedby="feedback-message-help"
          onChange={(e) => {
            setMessage(e.target.value);
            setError(null);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="feedback-message-help" className="text-xs text-foreground/60">
            Minimal {FEEDBACK_MIN_LENGTH} karakter. Sebutkan halaman atau
            langkah yang bermasalah agar mudah ditindaklanjuti.
          </p>
          <span
            className="text-xs text-foreground/60"
            aria-live="polite"
          >
            {panjang}/{FEEDBACK_MAX_LENGTH}
          </span>
        </div>
        {terlaluPendek ? (
          <FieldError>
            Masih kurang {FEEDBACK_MIN_LENGTH - panjang} karakter.
          </FieldError>
        ) : null}
      </div>

      {error ? <FieldError>{error}</FieldError> : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="success"
          disabled={saving || !lengkap}
          title={saving ? "Mengirim…" : "Kirim masukan"}
          aria-label={saving ? "Mengirim masukan" : "Kirim masukan"}
        >
          {saving ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Send aria-hidden />
          )}
          {saving ? "Mengirim..." : "Kirim"}
        </Button>
      </div>
    </form>
  );
}
