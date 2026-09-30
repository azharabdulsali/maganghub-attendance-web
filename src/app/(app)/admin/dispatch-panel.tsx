"use client";

// src/app/(app)/admin/dispatch-panel.tsx — tombol "jalankan sekarang" untuk admin.
//
// Admin bisa memicu pemrosesan massal tanpa membuka GitHub Actions. Berguna saat
// menguji jelang produksi (tanpa ALLOW_LIVE_SUBMIT, hasilnya DRY_RUN) atau
// mengejar ketertinggalan bila cron eksternal terlewat.
//
// Komponen ini TIDAK memutuskan siapa yang dikirim — server (runDispatch) yang
// memilih user berdasarkan jam jadwalnya. Klien hanya menekan tombol dan
// menampilkan ringkasan. Tidak ada rahasia yang berpindah ke peramban.

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

type DispatchSummary = {
  ok: true;
  hour: number;
  considered: number;
  processed: number;
  deferred: number;
  deadlineHit: boolean;
  results: Array<{ userId: string; kind: string }>;
};

/** Label manusia untuk tiap `kind` dari SubmitOutcome (bukan rahasia). */
const KIND_LABEL: Record<string, string> = {
  SUBMITTED: "Terkirim",
  DRY_RUN: "Latihan (dry-run)",
  NOT_READY: "Belum siap / dilewati",
  EXCHANGE_FAILED: "Gagal tukar token",
  TOKEN_UNREADABLE: "Token tak terbaca",
  BAD_DATE: "Tanggal tidak sah",
  ERROR: "Galat tak terduga",
  SKIPPED: "Dilewati",
};

function toneForKind(kind: string): "good" | "bad" | "neutral" {
  if (kind === "SUBMITTED" || kind === "DRY_RUN") return "good";
  if (kind === "ERROR" || kind === "EXCHANGE_FAILED" || kind === "TOKEN_UNREADABLE") {
    return "bad";
  }
  return "neutral";
}

export function DispatchPanel() {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [summary, setSummary] = React.useState<DispatchSummary | null>(null);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dispatch", { method: "POST" });
      const data = (await res.json()) as DispatchSummary | { error?: string };
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? "Permintaan gagal.";
        toast.error("Tidak bisa menjalankan", msg);
        return;
      }
      setSummary(data as DispatchSummary);
      const s = data as DispatchSummary;
      toast.success(
        "Pengiriman massal selesai",
        `${s.processed} diproses dari ${s.considered} user aktif (jam ${s.hour} WIB).`,
      );
    } catch {
      toast.error("Tidak bisa menjalankan", "Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6 border-dashed">
      <CardHeader>
        <CardTitle>Pengiriman massal (semua user)</CardTitle>
        <CardDescription>
          Menjalankan pengiriman untuk <strong>semua</strong> user yang jam
          jadwalnya sama dengan jam sekarang (WIB). Jalur normal sudah otomatis
          lewat cron tiap jam; tombol ini untuk menguji atau mengejar
          ketertinggalan. Setiap percobaan tetap tercatat di audit log dengan
          pemicu <code>CRON</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={run} disabled={busy} variant="neutral">
          {busy ? "Menjalankan…" : "Jalankan sekarang"}
        </Button>

        {summary ? (
          <div className="space-y-2 rounded-base border-2 border-border p-3 text-sm">
            <p>
              Jam WIB <strong>{summary.hour}:00</strong> · diproses{" "}
              <strong>{summary.processed}</strong> dari{" "}
              <strong>{summary.considered}</strong> user aktif
              {summary.deferred > 0 ? (
                <>
                  {" "}· <strong>{summary.deferred}</strong> tertunda ke jam
                  berikutnya
                </>
              ) : null}
              {summary.deadlineHit ? " · tenggat tercapai (sebagian diproses)" : ""}
            </p>

            {summary.results.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {summary.results.map((r) => (
                  <li key={r.userId}>
                    <Badge tone={toneForKind(r.kind)}>
                      {KIND_LABEL[r.kind] ?? r.kind}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-foreground/70">
                Tidak ada user yang jadwalnya jatuh pada jam ini.
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
