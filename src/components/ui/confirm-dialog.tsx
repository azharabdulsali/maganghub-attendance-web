"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            // `render={<div />}` (bukan `<p>`): beberapa pemanggil menaruh
            // konten berblok (kode, tombol, label) di dalam `description`, dan
            // `<div>` di dalam `<p>` melanggar HTML → memicu hydration error.
            <AlertDialogDescription render={<div />}>
              {description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        <AlertDialogFooter>
          {hideConfirm ? (
            // Dialog hasil/informasi: satu tombol tutup. Tetap `Close`, jadi
            // `onOpenChange` dihormati (pemanggil bisa menolak penutupan).
            <AlertDialogCancel type="button">{cancelLabel}</AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel type="button">{cancelLabel}</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                variant={confirmVariant}
                onClick={onConfirm}
              >
                {confirmLabel}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDialog };
