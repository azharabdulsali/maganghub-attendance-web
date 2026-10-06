"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Dialog konfirmasi untuk aksi yang tidak bisa dibatalkan.
 *
 * Kenapa tidak `window.confirm` lagi: dialog bawaan browser itu memblokir tab,
 * tampil beda di tiap OS, dan tidak bisa diberi konteks (mis. menyebutkan
 * konsekuensinya). Base UI `AlertDialog` memberi yang penting secara bawaan,
 * focus trap, tombol Esc, `role="alertdialog"`, dan tombol batal yang otomatis
 * jadi fokus awal, sehingga kita tidak perlu menulis logika itu sendiri.
 *
 * Dipakai dengan dua cara:
 *   - `<ConfirmDialog ... />` terkendali (buka/tutup dari state pemanggil), atau
 *   - `useConfirm()` hook imperatif: `const yakin = await confirm({...})`.
 *
 * `useAlertDialog` sengaja TIDAK dipakai di dalam komponen ini supaya berkas ini
 * tetap bisa di-render di mana saja tanpa provider.
 */

interface ConfirmDialogBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Gaya tombol konfirmasi. Pakai "danger" untuk aksi merusak (hapus), "neutral" untuk aksi biasa. */
  confirmVariant?: "default" | "neutral" | "reverse" | "noShadow" | "danger" | "success";
}

/**
 * Dua bentuk yang saling eksklusif:
 *   - dialog konfirmasi biasa: punya `onConfirm` dan merender dua tombol;
 *   - dialog hasil/informasi (`hideConfirm`): hanya satu tombol tutup, jadi
 *     `onConfirm` tidak ada — penutupan ditangani lewat `onOpenChange`.
 *
 * Dibuat union, bukan `onConfirm?` opsional, supaya pemanggil tidak bisa lupa
 * memberi `onConfirm` pada dialog yang benar-benar butuh konfirmasi.
 */
type ConfirmDialogProps = ConfirmDialogBaseProps &
  (
    | {
        /**
         * Sembunyikan tombol konfirmasi, sisakan SATU tombol (pakai
         * `cancelLabel`). Untuk dialog yang isinya hasil/informasi, bukan
         * pertanyaan ya-tidak: dua tombol yang keduanya menutup hanya
         * membingungkan ("batal" dari apa?). Saat ini dipakai dialog kata
         * sandi sementara di user-actions.tsx.
         *
         * Tombol yang tersisa tetap tombol `Close`, jadi `onOpenChange` tetap
         * dihormati: pemanggil bisa menolak penutupan (mis. wajib centang
         * dulu) dan dialog tidak akan tertutup.
         */
        hideConfirm: true;
        onConfirm?: undefined;
      }
    | {
        hideConfirm?: false;
        onConfirm: () => void;
      }
  );

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
  cancelLabel = "Batal",
  confirmVariant = "default",
  hideConfirm = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Backdrop
          data-slot="confirm-dialog-backdrop"
          className="fixed inset-0 z-50 bg-overlay/60 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <AlertDialogPrimitive.Popup
          data-slot="confirm-dialog-popup"
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-base border-2 border-border bg-background p-5 shadow-shadow",
            "transition-all data-ending-style:opacity-0 data-ending-style:scale-95 data-starting-style:opacity-0 data-starting-style:scale-95",
          )}
        >
          <AlertDialogPrimitive.Title className="font-heading text-lg">
            {title}
          </AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description
              render={<p />}
              className="mt-2 text-sm text-foreground/80"
            >
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Close
              render={
                <Button variant="neutral" type="button">
                  {cancelLabel}
                </Button>
              }
            />
            {hideConfirm ? null : (
              <Button
                type="button"
                variant={confirmVariant}
                onClick={() => {
                  onConfirm?.();
                  onOpenChange(false);
                }}
              >
                {confirmLabel}
              </Button>
            )}
          </div>
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export { ConfirmDialog };
