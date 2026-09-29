"use client";

// Alat diagnostik: menempel rekaman HAR/curl, lalu memanggil API analisis.
// Tidak menyimpan apa pun ke database; hasilnya hanya ditampilkan di layar.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Candidate = {
  method: string;
  path: string;
  headerNames: string[];
  contentType: string | null;
  fieldNames: string[];
  bodyKind: string;
  responseStatus: number | null;
  responseSnippet: string | null;
};

type Hasil = {
  ok: boolean;
  message: string;
  candidates: Candidate[];
};

export default function AnalyzeCaptureForm() {
  const [raw, setRaw] = useState("");
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function analisis() {
    setError(null);
    setHasil(null);
    setLoading(true);
    try {
      const res = await fetch("/api/dev-tools/analyze-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Hasil> & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Analisis gagal.");
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cara merekam (sekali saja)</CardTitle>
          <CardDescription>
            Semua langkah dilakukan <strong>di browser Anda sendiri</strong>.
            Server ini tidak pernah menekan tombol apa pun di portal Monev.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-foreground/80">
            <li>
              1. Buka portal Monev yang sudah login, masuk ke halaman isi
              laporan.
            </li>
            <li>
              2. Buka DevTools → tab <strong>Network</strong>, centang{" "}
              <em>Preserve log</em>, lalu pilih filter <strong>Fetch/XHR</strong>.
            </li>
            <li>
              3. Isi laporan seperti biasa (termasuk kolom kehadiran), lalu tekan{" "}
              <strong>Simpan dan Kirim</strong> — cukup <strong>sekali</strong>.
            </li>
            <li>
              4. Klik kanan permintaan yang muncul → <em>Copy</em> →{" "}
              <strong>Copy as cURL</strong>, tempel di bawah.
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tempel rekaman</CardTitle>
          <CardDescription>
            Tempel perintah curl <em>atau</em> isi berkas HAR. Nilai token,
            cookie, dan password otomatis disamarkan — yang kami perlukan hanya
            nama field dan bentuk body.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="capture">Rekaman (curl atau HAR)</Label>
            <Textarea
              id="capture"
              rows={10}
              spellCheck={false}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="curl 'https://monev-api.maganghub.kemnaker.go.id/api/v1/...' -H 'Content-Type: application/json' --data-raw '{...}'"
            />
          </div>
          <Button onClick={analisis} disabled={loading || raw.trim().length === 0}>
            {loading ? "Menganalisis..." : "Analisis"}
          </Button>

          {error && <Message tone="bad">{error}</Message>}
        </CardContent>
      </Card>

      {hasil && (
        <Card>
          <CardHeader>
            <CardTitle>Hasil</CardTitle>
            <CardDescription>{hasil.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasil.candidates.map((c, i) => (
              <div
                key={i}
                className="rounded-base border-2 border-border p-4 text-sm"
              >
                <p className="font-heading">
                  {c.method} {c.path}
                </p>
                <dl className="mt-2 space-y-1 text-foreground/80">
                  <div>
                    <dt className="inline font-heading">Status respons: </dt>
                    <dd className="inline">{c.responseStatus ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-heading">Content-Type: </dt>
                    <dd className="inline">{c.contentType ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-heading">Bentuk body: </dt>
                    <dd className="inline">{c.bodyKind}</dd>
                  </div>
                  <div>
                    <dt className="inline font-heading">Nama field: </dt>
                    <dd className="inline">
                      {c.fieldNames.length ? c.fieldNames.join(", ") : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-heading">Header terkirim: </dt>
                    <dd className="inline">
                      {c.headerNames.length ? c.headerNames.join(", ") : "—"}
                    </dd>
                  </div>
                </dl>
                {c.responseSnippet && (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-base border-2 border-border bg-secondary-background p-2 text-xs">
                    {c.responseSnippet}
                  </pre>
                )}
              </div>
            ))}
            <p className="text-xs text-foreground/60">
              Salin hasil di atas ke dokumen proyek (docs/MONEV-API.md §8) untuk
              melengkapi kontrak submit.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
