"use client";

// Tombol "Kirim Absen Hari Ini" — memanggil /api/reports/submit (trigger MANUAL).
//
// Sengaja TIDAK menyediakan pemilih tanggal: pengguna cukup mengirim untuk
// hari ini. Tanggal target dihitung server dalam zona Asia/Jakarta, supaya
// tidak bisa memilih hari yang salah karena jam perangkat.

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Message } from "@/components/ui/message";

type Hasil = {
  ok: boolean;
  status: string;
  message: string;
  date?: string;
};

/**
 * Kode status yang berarti "token Monev perlu diganti" — pengguna harus pergi
 * ke halaman kredensial dan menempel token baru. SPEC.md §397 mewajibkan jalur
 * re-auth yang jelas, bukan sekadar teks error mentah.
 */
const BUTUH_TOKEN_BARU = new Set(["SESSION_DEAD", "INVALID", "TOKEN_UNREADABLE"]);

export default function SubmitReportButton() {
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [butuhToken, setButuhToken] = useState(false);
  const [loading, setLoading] = useState(false);

  async function kirim() {
    setError(null);
    setHasil(null);
    setButuhToken(false);
    setLoading(true);
    try {
      const res = await fetch("/api/reports/submit", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Partial<Hasil> & {
        error?: string;
        status?: string;
      };
      if (!res.ok) {
        setError(data.error ?? data.message ?? "Pengiriman gagal.");
        return;
      }
      setHasil(data as Hasil);
      setButuhToken(BUTUH_TOKEN_BARU.has(data.status ?? ""));
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

      {error && <Message tone="bad">{error}</Message>}

      {hasil && (
        <Message tone="neutral" as="div">
          <p className="font-heading">{hasil.status}</p>
          <p className="mt-1 text-foreground/80">{hasil.message}</p>
          {hasil.date && (
            <p className="mt-1 text-xs text-foreground/60">
              Tanggal target: {hasil.date}
            </p>
          )}
          {/* Jalur re-auth yang jelas (SPEC.md §397) — bukan sekadar pesan error. */}
          {butuhToken && (
            <Button
              className="mt-3"
              render={<Link href="/credentials" />}
            >
              Buka halaman kredensial
            </Button>
          )}
        </Message>
      )}
    </div>
  );
}
