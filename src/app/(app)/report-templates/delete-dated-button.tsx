"use client";

// src/app/(app)/report-templates/delete-dated-button.tsx
//
// Tombol "Hapus" untuk satu baris di tabel template khusus tanggal.
//
// Kenapa komponen klien terpisah, padahal tabelnya server component: hapus
// adalah aksi interaktif (fetch + konfirmasi + muat ulang data). Menjadikan
// seluruh tabel `"use client"` akan menyeret query Prisma ke bundel klien —
// tidak perlu. Jadi hanya tombol mungil ini yang menjadi pulau klien.
//
// Alur: klik → <ConfirmDialog> memuat konsekuensinya (tanggal itu kembali ke
// template default) → DELETE `/api/report-templates/dated?date=...` → toast →
// `router.refresh()` supaya baris hilang dari tabel tanpa reload penuh.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function DeleteDatedButton({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function hapus() {
    if (working) return;
    setWorking(true);
    try {
      const res = await fetch(
        `/api/report-templates/dated?date=${encodeURIComponent(date)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(
          "Gagal menghapus template",
          data.error ?? "Coba lagi sebentar.",
        );
        return;
      }

      toast.success(
        "Template tanggal dihapus",
        `${date} kembali memakai template default.`,
      );
      router.refresh();
    } catch {
      toast.error(
        "Gagal menghapus template",
        "Tidak bisa menghubungi server. Periksa koneksi Anda.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="danger"
        size="icon-sm"
        disabled={working}
        onClick={() => setOpen(true)}
        title={`Hapus template tanggal ${date}`}
        aria-label={`Hapus template tanggal ${date}`}
      >
        <Trash2 aria-hidden />
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Hapus template ${date}?`}
        description={
          <>
            Tanggal <b>{date}</b> akan kembali memakai <b>template default</b>.
            Laporan yang pernah terkirim untuk tanggal itu <b>tidak</b> ikut
            terhapus. Tindakan ini tidak bisa dibatalkan.
          </>
        }
        confirmLabel="Ya, hapus"
        cancelLabel="Batal"
        confirmVariant="danger"
        onConfirm={() => void hapus()}
      />
    </>
  );
}
