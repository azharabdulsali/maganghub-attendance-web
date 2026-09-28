"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  hasExisting: boolean;
  existingEmail: string | null;
  existingStatus: string | null;
  updatedAt: string | null;
};

function formatTanggal(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "-";
  }
}

export default function CredentialsForm({
  hasExisting,
  existingEmail,
  existingStatus,
  updatedAt,
}: Props) {
  const router = useRouter();

  // Kalau sudah ada kredensial, form disembunyikan dulu — supaya tidak
  // sengaja/tidak sengaja menimpa password yang sudah benar.
  const [mode, setMode] = useState<"lihat" | "isi">(
    hasExisting ? "lihat" : "isi",
  );

  const [emailMonev, setEmailMonev] = useState(existingEmail ?? "");
  const [passwordMonev, setPasswordMonev] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSukses(null);
    setLoading(true);

    try {
      const res = await fetch("/api/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailMonev, passwordMonev }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan kredensial");
        return;
      }

      setPasswordMonev(""); // jangan biarkan password tertinggal di state
      setSukses("Kredensial berhasil disimpan (terenkripsi).");
      setMode("lihat");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }

  async function hapus() {
    if (!confirm("Hapus kredensial Monev yang tersimpan?")) return;

    setError(null);
    setSukses(null);
    setLoading(true);

    try {
      const res = await fetch("/api/credentials", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Gagal menghapus kredensial");
        return;
      }

      setEmailMonev("");
      setSukses("Kredensial dihapus.");
      setMode("isi");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {sukses && (
        <p className="rounded-base border-2 border-border bg-main px-3 py-2 text-sm text-main-foreground">
          {sukses}
        </p>
      )}

      {error && (
        <p className="rounded-base border-2 border-border bg-background px-3 py-2 text-sm text-foreground">
          {error}
        </p>
      )}

      {mode === "lihat" ? (
        <Card>
          <CardHeader>
            <CardTitle>Kredensial tersimpan</CardTitle>
            <CardDescription>
              Password tidak bisa ditampilkan kembali — hanya bisa diganti.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <dt className="font-heading sm:w-40">Email Monev</dt>
                <dd className="break-all text-foreground/80">
                  {existingEmail ?? "-"}
                </dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <dt className="font-heading sm:w-40">Status</dt>
                <dd>
                  <span className="inline-flex items-center rounded-base border-2 border-border bg-secondary-background px-3 py-1 text-xs font-heading">
                    {existingStatus ?? "-"}
                  </span>
                </dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <dt className="font-heading sm:w-40">Terakhir diubah</dt>
                <dd className="text-foreground/80">{formatTanggal(updatedAt)}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => setMode("isi")} disabled={loading}>
                Ganti kredensial
              </Button>
              <Button variant="neutral" onClick={hapus} disabled={loading}>
                Hapus
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {hasExisting ? "Ganti kredensial" : "Isi kredensial"}
            </CardTitle>
            <CardDescription>
              Password disimpan terenkripsi (AES-256-GCM) dan tidak bisa dibaca
              kembali.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={simpan} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emailMonev">Email Monev</Label>
                <Input
                  id="emailMonev"
                  type="email"
                  required
                  autoComplete="username"
                  value={emailMonev}
                  onChange={(e) => setEmailMonev(e.target.value)}
                  placeholder="nama@contoh.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passwordMonev">Password Monev</Label>
                <Input
                  id="passwordMonev"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={passwordMonev}
                  onChange={(e) => setPasswordMonev(e.target.value)}
                  placeholder="Password portal Maganghub"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="submit" disabled={loading}>
                  {loading ? "Menyimpan..." : "Simpan"}
                </Button>
                {hasExisting && (
                  <Button
                    type="button"
                    variant="neutral"
                    onClick={() => {
                      setMode("lihat");
                      setPasswordMonev("");
                      setError(null);
                    }}
                    disabled={loading}
                  >
                    Batal
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
