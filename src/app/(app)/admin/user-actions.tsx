// src/app/(app)/admin/user-actions.tsx: tombol aksi per baris di panel admin.
//
// Dua aksi: "Atur ulang kata sandi" dan "Hapus". Keduanya menyasar pengguna
// LAIN dan tidak bisa dibatalkan, jadi:
//   - konfirmasi dua langkah (ConfirmDialog) sebelum menembak server,
//   - hasil reset menampilkan kata sandi sementara SEKALI di layar, dengan
//     tombol salin dan gerbang "saya sudah menyalin" sebelum dialog bisa
//     ditutup — supaya admin tidak menutup tanpa menyimpan kata sandinya.
//
// Server tetap sumber kebenaran: komponen ini hanya menyembunyikan aksi yang
// jelas tak masuk akal (diri sendiri / admin lain) untuk mengurangi kesalahan,
// bukan sebagai pengaman. Penolakan sungguhan datang dari API.

"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Message } from "@/components/ui/message";
import { useToast } from "@/components/ui/toast";

type Aksi = "reset" | "hapus";

export function UserRowActions({
  userId,
  userEmail,
  isSelf,
  isAdmin,
}: {
  userId: string;
  userEmail: string;
  isSelf: boolean;
  isAdmin: boolean;
}) {
  const toast = useToast();
  const [konfirmasi, setKonfirmasi] = React.useState<Aksi | null>(null);
  const [working, setWorking] = React.useState(false);
  // Kata sandi sementara hasil reset; ditampilkan sekali lalu dibuang saat tutup.
  const [sandiBaru, setSandiBaru] = React.useState<string | null>(null);
  const [sudahSalin, setSudahSalin] = React.useState(false);

  // Aksi pada diri sendiri / admin lain tidak ditawarkan sama sekali.
  const terkunci = isSelf || isAdmin;
  const alasanKunci = isSelf
    ? "Tidak bisa pada akun sendiri"
    : "Tidak bisa pada admin lain";

  async function jalankanReset() {
    setWorking(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; temporaryPassword?: string }
        | null;
      if (!res.ok || !data?.temporaryPassword) {
        toast.error(
          "Gagal mengatur ulang",
          data?.error ?? "Server tidak mengembalikan kata sandi.",
        );
        return;
      }
      setSandiBaru(data.temporaryPassword);
      setSudahSalin(false);
      toast.success(
        "Kata sandi diatur ulang",
        "Salin kata sandi sementara dan kirimkan ke pengguna.",
      );
    } catch {
      toast.error("Gagal mengatur ulang", "Tidak bisa menghubungi server.");
    } finally {
      setWorking(false);
    }
  }

  async function jalankanHapus() {
    setWorking(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        toast.error("Gagal menghapus", data?.error ?? "Terjadi kesalahan.");
        return;
      }
      toast.success("Pengguna dihapus", `${userEmail} tidak lagi aktif.`);
      // Muat ulang agar baris yang terhapus lenyap dari tabel.
      window.location.reload();
    } catch {
      toast.error("Gagal menghapus", "Tidak bisa menghubungi server.");
    } finally {
      setWorking(false);
    }
  }

  async function salin() {
    if (!sandiBaru) return;
    try {
      await navigator.clipboard.writeText(sandiBaru);
      setSudahSalin(true);
      toast.success("Disalin", "Kata sandi sementara ada di papan klip.");
    } catch {
      toast.error(
        "Tidak bisa menyalin",
        "Salin manual, lalu centang kotak konfirmasi.",
      );
    }
  }

  return (
    <>
      <div className="flex flex-nowrap items-center gap-2">
        {/* Netral: aksi tak merusak. Sengaja beda dari Hapus (merah) dan
            Jalankan (hijau) di kolom Aksi yang sama. */}
        <Button
          type="button"
          variant="neutral"
          size="icon-sm"
          disabled={terkunci || working}
          title={terkunci ? alasanKunci : `Atur ulang kata sandi ${userEmail}`}
          aria-label={`Atur ulang kata sandi ${userEmail}`}
          onClick={() => setKonfirmasi("reset")}
        >
          <KeyRound aria-hidden />
        </Button>
        {/* Merah (danger): aksi merusak, tak bisa dibatalkan. */}
        <Button
          type="button"
          variant="danger"
          size="icon-sm"
          disabled={terkunci || working}
          title={terkunci ? alasanKunci : `Hapus ${userEmail}`}
          aria-label={`Hapus ${userEmail}`}
          onClick={() => setKonfirmasi("hapus")}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>

      {/* Konfirmasi reset — kata sandi belum dibuat sampai dikonfirmasi. */}
      <ConfirmDialog
        open={konfirmasi === "reset"}
        onOpenChange={(buka) => !buka && setKonfirmasi(null)}
        title="Atur ulang kata sandi?"
        description={`Kata sandi baru akan dibuat untuk ${userEmail} dan semua sesinya saat ini akan berakhir. Kata sandi baru hanya ditampilkan sekali.`}
        confirmLabel="Ya, atur ulang"
        onConfirm={() => {
          setKonfirmasi(null);
          void jalankanReset();
        }}
      />

      {/* Konfirmasi hapus. */}
      <ConfirmDialog
        open={konfirmasi === "hapus"}
        onOpenChange={(buka) => !buka && setKonfirmasi(null)}
        title="Hapus pengguna ini?"
        description={`${userEmail} tidak akan bisa masuk lagi dan hilang dari daftar. Data lama tetap tersimpan untuk audit.`}
        confirmLabel="Ya, hapus"
        confirmVariant="danger"
        onConfirm={() => {
          setKonfirmasi(null);
          void jalankanHapus();
        }}
      />

      {/* Dialog hasil: kata sandi sementara, tampil sekali. */}
      {sandiBaru ? (
        <ConfirmDialog
          open
          onOpenChange={(buka) => {
            // Hanya boleh ditutup setelah admin menandai sudah menyalin.
            if (!buka && sudahSalin) {
              setSandiBaru(null);
              setSudahSalin(false);
            }
          }}
          title="Kata sandi sementara"
          cancelLabel="Tutup"
          hideConfirm
          description={
            <div className="flex flex-col gap-3">
              <span>
                Kirim kata sandi ini ke <strong>{userEmail}</strong>. Kata sandi
                tidak ditampilkan lagi setelah dialog ditutup.
              </span>
              <code className="block break-all rounded-base border-2 border-border bg-secondary-background p-2 font-mono text-sm">
                {sandiBaru}
              </code>
              <Button
                type="button"
                variant={sudahSalin ? "success" : "noShadow"}
                size="sm"
                onClick={() => void salin()}
                title={sudahSalin ? "Tersalin" : "Salin kata sandi"}
                aria-label={sudahSalin ? "Tersalin" : "Salin kata sandi"}
              >
                {sudahSalin ? (
                  <>
                    <Check aria-hidden />
                    Tersalin ✓
                  </>
                ) : (
                  <>
                    <Copy aria-hidden />
                    Salin
                  </>
                )}
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sudahSalin}
                  onChange={(e) => setSudahSalin(e.target.checked)}
                />
                Saya sudah menyalin &amp; mengirim kata sandi ini
              </label>
              {!sudahSalin ? (
                // `as="div"`: ini berada di dalam description ConfirmDialog yang
                // dirender sebagai <p>. Message default juga <p>, dan <p> di
                // dalam <p> melanggar HTML (memicu hydration error). <div> aman.
                <Message tone="bad" as="div">
                  Centang kotak di atas dulu sebelum menutup.
                </Message>
              ) : null}
            </div>
          }
        />
      ) : null}
    </>
  );
}

