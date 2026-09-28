"use client";

// Tombol "Kirim Absen Hari Ini" — memanggil /api/reports/submit (trigger MANUAL).
//
// Sengaja TIDAK menyediakan pemilih tanggal: pengguna cukup mengirim untuk
// hari ini. Tanggal target dihitung server dalam zona Asia/Jakarta, supaya
// tidak bisa memilih hari yang salah karena jam perangkat.

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Hasil = {
  ok: boolean;
  status: string;
  message: string;
  date?: string;
};

export default function SubmitReportButton() {
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function kirim() {
    setError(null);
    setHasil(null);
    setLoading(true);
    try {
      const res = await fetch("/api/reports/submit", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Partial<Hasil> & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? data.message ?? "Pengiriman gagal.");
        return;
      }
      setHasil(data as Hasil);
    } catch {
      setError("Tidak dapat menghubungi server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={kirim} disabled={loading}>
        {loading ? "Mengirim..." : "Kirim Absen Hari Ini"}
      </Button>

      {error && (
        <p className="rounded-base border-2 border-border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {hasil && (
        <div className="rounded-base border-2 border-border px-3 py-2 text-sm">
          <p className="font-heading">{hasil.status}</p>
          <p className="mt-1 text-foreground/80">{hasil.message}</p>
          {hasil.date && (
            <p className="mt-1 text-xs text-foreground/60">
              Tanggal target: {hasil.date}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
