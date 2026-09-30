"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Message } from "@/components/ui/message";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
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
  const toast = useToast();

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
  const [confirmHapusOpen, setConfirmHapusOpen] = useState(false);

  // --- Login otomatis (Opsi A — docs/MONEV-API.md §7) ---
  const [loginMsg, setLoginMsg] = useState<string | null>(null);
  const [loginState, setLoginState] = useState<
    "idle" | "ok" | "rejected" | "error"
  >("idle");
  const [loginLoading, setLoginLoading] = useState(false);

  async function loginOtomatis() {
    setLoginMsg(null);
    setLoginState("idle");
    setLoginLoading(true);

    try {
      const res = await fetch("/api/credentials/login", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setLoginState("error");
        setLoginMsg(data.error ?? "Login otomatis gagal dijalankan.");
        toast.error(
          "Login otomatis gagal",
          data.error ?? "Periksa email & password Monev Anda.",
        );
        return;
      }

      if (data.status === "ACTIVE") {
        setLoginState("ok");
        setLoginMsg(data.message ?? "Login otomatis berhasil.");
        toast.success("Sesi Monev terhubung", "Sesi berhasil disimpan.");
        router.refresh();
      } else if (data.status === "REJECTED") {
        setLoginState("rejected");
        setLoginMsg(
          data.message ??
            "Portal menolak login. Periksa email & password Monev Anda.",
        );
        toast.error(
          "Portal menolak login",
          "Periksa email & password Monev Anda.",
        );
        router.refresh();
      } else {
        setLoginState("error");
        setLoginMsg(
          data.message ??
            "Login otomatis belum bisa memastikan hasilnya. Coba lagi sebentar.",
        );
      }
    } catch {
      setLoginState("error");
      setLoginMsg("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setLoginLoading(false);
    }
  }

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
        const pesan = data.error ?? "Gagal menyimpan kredensial";
        setError(pesan);
        toast.error("Gagal menyimpan kredensial", pesan);
        return;
      }

      setPasswordMonev(""); // jangan biarkan password tertinggal di state
      setSukses("Kredensial berhasil disimpan (terenkripsi).");
      setMode("lihat");
      toast.success(
        "Kredensial tersimpan",
        "Email & password Monev disimpan terenkripsi.",
      );
      router.refresh();
    } catch {
      const pesan = "Tidak dapat menghubungi server. Periksa koneksi Anda.";
      setError(pesan);
      toast.error("Gagal menyimpan kredensial", pesan);
    } finally {
      setLoading(false);
    }
  }

  async function hapus() {
    setError(null);
    setSukses(null);
    setLoading(true);

    try {
      const res = await fetch("/api/credentials", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        const pesan = data.error ?? "Gagal menghapus kredensial";
        setError(pesan);
        toast.error("Gagal menghapus kredensial", pesan);
        return;
      }

      setEmailMonev("");
      setSukses("Kredensial dihapus.");
      setMode("isi");
      toast.success("Kredensial dihapus", "Absensi otomatis perlu diisi ulang.");
      router.refresh();
    } catch {
      const pesan = "Tidak dapat menghubungi server. Periksa koneksi Anda.";
      setError(pesan);
      toast.error("Gagal menghapus kredensial", pesan);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {sukses && <Message tone="good">{sukses}</Message>}

      {error && <Message tone="bad">{error}</Message>}

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
              <Button
                variant="neutral"
                onClick={() => setConfirmHapusOpen(true)}
                disabled={loading}
              >
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
                <PasswordInput
                  id="passwordMonev"
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

      {/* Login otomatis — jalur utama (Opsi A, docs/MONEV-API.md §7). Server
          yang login ke SSO memakai kredensial tersimpan; pengguna tidak perlu
          menyentuh DevTools. Hanya menyimpan sesi, tidak mengirim laporan. */}
      <Card>
        <CardHeader>
          <CardTitle>Hubungkan sesi Monev</CardTitle>
          <CardDescription>
            Cara mudah: cukup klik tombol di bawah. Kami akan login ke portal
            memakai email &amp; password yang tersimpan, lalu menyimpan sesinya
            secara terenkripsi. Tidak ada laporan yang dikirim.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={loginOtomatis} disabled={loginLoading || !hasExisting}>
            {loginLoading ? "Menghubungkan..." : "Login otomatis"}
          </Button>

          {!hasExisting && (
            <p className="text-xs text-foreground/70">
              Isi email &amp; password Monev terlebih dahulu di kartu atas,
              lalu kembali ke sini.
            </p>
          )}

          {loginMsg && (
            <Message tone={loginState === "ok" ? "good" : "bad"}>
              {loginMsg}
            </Message>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmHapusOpen}
        onOpenChange={setConfirmHapusOpen}
        title="Hapus kredensial Monev?"
        description="Email & password Monev yang tersimpan akan dihapus, dan sesi Monev ikut terputus. Absensi otomatis tidak bisa jalan sampai Anda mengisinya kembali."
        confirmLabel="Hapus kredensial"
        onConfirm={() => void hapus()}
      />
    </div>
  );
}
