"use client";

// src/app/(app)/admin/feedback/feedback-actions.tsx: aksi per baris masukan.
//
// Dua aksi, keduanya sengaja berupa IKON + tooltip (AGENTS.md §3):
//   - `Check`  = tandai sudah dibaca (hanya muncul bila belum dibaca)
//   - `Trash2` = hapus, dengan <ConfirmDialog> karena tidak bisa dibatalkan
// Setelah berhasil: toast + `router.refresh()` agar baris/status langsung
// berubah tanpa refresh manual.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function FeedbackActions({
  id,
  sudahDibaca,
}: {
  id: string;
  sudahDibaca: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<"baca" | "hapus" | null>(null);
  const [konfirmasi, setKonfirmasi] = useState(false);

  async function tandaiDibaca() {
    setBusy("baca");
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, { method: "PATCH" });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        toast.error("Gagal menandai", data?.error ?? "Terjadi kesalahan.");
        return;
      }
      toast.success("Ditandai sudah dibaca");
      router.refresh();
    } catch {
      toast.error("Gagal menandai", "Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  async function hapus() {
    setBusy("hapus");
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        toast.error("Gagal menghapus", data?.error ?? "Terjadi kesalahan.");
        return;
      }
      toast.success("Masukan dihapus");
      router.refresh();
    } catch {
      toast.error("Gagal menghapus", "Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        {!sudahDibaca ? (
          <Button
            type="button"
            variant="success"
            size="icon-sm"
            disabled={busy !== null}
            title="Tandai sudah dibaca"
            aria-label="Tandai sudah dibaca"
            onClick={() => void tandaiDibaca()}
          >
            {busy === "baca" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="danger"
          size="icon-sm"
          disabled={busy !== null}
          title="Hapus masukan"
          aria-label="Hapus masukan"
          onClick={() => setKonfirmasi(true)}
        >
          {busy === "hapus" ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Trash2 aria-hidden />
          )}
        </Button>
      </div>

      <ConfirmDialog
        open={konfirmasi}
        onOpenChange={setKonfirmasi}
        title="Hapus masukan ini?"
        description="Masukan akan hilang permanen dari daftar. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Ya, hapus"
        confirmVariant="danger"
        onConfirm={() => {
          setKonfirmasi(false);
          void hapus();
        }}
      />
    </>
  );
}
