"use client";

// Tombol "Kirim Absen Hari Ini", memanggil /api/reports/submit (trigger MANUAL).
//
// Sengaja TIDAK menyediakan pemilih tanggal: pengguna cukup mengirim untuk
// hari ini. Tanggal target dihitung server dalam zona Asia/Jakarta, supaya
// tidak bisa memilih hari yang salah karena jam perangkat.

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Message } from "@/components/ui/message";

type Hasil = {
  ok: boolean;
  status: string;
  message: string;
  date?: string;
};

/**
 * Kode status yang berarti "token Monev perlu diganti", pengguna harus pergi
 * ke halaman kredensial dan menempel token baru. SPEC.md §397 mewajibkan jalur
 * re-auth yang jelas, bukan sekadar teks error mentah.
 */
const BUTUH_TOKEN_BARU = new Set(["SESSION_DEAD", "INVALID", "TOKEN_UNREADABLE"]);

/**
 * Label manusia untuk kode status hasil pengiriman.
 *
 * Kode mentah (`SUCCESS`, `ALREADY_SUBMITTED`, `DRY_RUN`, …) adalah kosakata
 * internal; menampilkannya sebagai judul pesan membuat pengguna membaca jargon.
 * Pesan rinci tetap datang dari server (`hasil.message`), label ini hanya
 * ringkasan satu baris.
 */
const STATUS_LABEL: Record<string, string> = {
  SUCCESS: "Berhasil dikirim",
  ALREADY_SUBMITTED: "Sudah pernah dikirim",
  DUPLICATE: "Sudah pernah dikirim",
  ERROR: "Gagal dikirim",
  FAILED: "Gagal dikirim",
  DRY_RUN: "Mode latihan",
  SKIPPED_ALREADY_DONE: "Sudah dikirim hari ini",
  EXCHANGE_FAILED: "Sesi Monev bermasalah",
  NOT_READY: "Belum siap dikirim",
  PROGRAM_ENDED: "Program sudah berakhir",
  POLICY_SKIPPED: "Dilewati (libur atau bukan hari kerja)",
};

/** Nada pesan hasil: sukses hijau, latihan netral, sisanya merah. */
function toneForStatus(status: string, ok: boolean): "good" | "bad" | "neutral" {
  if (status === "DRY_RUN") return "neutral";
  return ok ? "good" : "bad";
}

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
      <Button
        onClick={kirim}
        disabled={loading}
        className="w-full sm:w-auto"
        title={loading ? "Mengirim…" : "Kirim Absen Hari Ini"}
        aria-label={loading ? "Mengirim absen" : "Kirim Absen Hari Ini"}
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Send aria-hidden />
        )}
        {loading ? "Mengirim..." : "Kirim Absen Hari Ini"}
      </Button>

      {error && <Message tone="bad">{error}</Message>}

      {hasil && (
        <Message tone={toneForStatus(hasil.status, hasil.ok)} as="div">
          <p className="font-heading">
            {STATUS_LABEL[hasil.status] ?? "Hasil pengiriman"}
          </p>
          <p className="mt-1 text-muted-foreground">{hasil.message}</p>
          {hasil.date && (
            <p className="mt-1 text-xs text-muted-foreground">
              Tanggal target: {hasil.date}
            </p>
          )}
          {/* Jalur re-auth yang jelas (SPEC.md §397), bukan sekadar pesan error. */}
          {butuhToken && (
            <Button
              className="mt-3"
              render={<Link href="/credentials" />}
              title="Buka halaman kredensial"
              aria-label="Buka halaman kredensial"
            >
              <KeyRound aria-hidden />
              Buka halaman kredensial
            </Button>
          )}
        </Message>
      )}
    </div>
  );
}
