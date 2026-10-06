"use client";

// src/components/sign-out-button.tsx: tombol Keluar dengan konfirmasi.
//
// Kenapa dipisah dari app-sidebar.tsx: sidebar itu sudah panjang dan mengurus
// dua tata letak (sidebar tetap + laci mobile). Menaruh state dialog di sana
// membuat dua hal tak berhubungan bercampur. Komponen ini hanya mengurus satu
// hal: "minta konfirmasi sebelum keluar, lalu kirim form-nya".
//
// Kenapa konfirmasi sama sekali: keluar itu tidak merusak data, tapi mahal
// untuk dibatalkan, pengguna harus mengetik ulang email & sandi. Salah tap
// di daftar menu yang rapat (mobile) cukup untuk mengeluarkan seseorang.
//
// Yang PENTING: jangan panggil signOutAction() langsung dari onClick. Kalau
// begitu, form-nya hanya jalan berkat JavaScript, dan kehilangan perilaku
// bawaan form (bisa submit sebelum React sempat hydrate). Kita jaga <form>
// tetap asli, lalu cukup `requestSubmit()` dari dialog. Dengan begitu, kalau
// JS mati, tombolnya tetap berfungsi seperti semula.

import { useRef, useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { signOutAction } from "@/components/sign-out-action";

function SignOutButton() {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <form action={signOutAction} ref={formRef} className="mt-3">
        <Button
          type="button"
          variant="neutral"
          size="sm"
          className="w-full justify-center"
          onClick={() => setOpen(true)}
          title="Keluar"
          aria-label="Keluar dari akun"
        >
          <LogOut aria-hidden />
          Keluar
        </Button>
      </form>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Keluar dari MagangHub?"
        description="Anda perlu memasukkan email dan sandi lagi untuk masuk. Absensi yang belum terkirim tidak akan hilang."
        confirmLabel="Ya, keluar"
        cancelLabel="Tetap di sini"
        confirmVariant="danger"
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </>
  );
}

export { SignOutButton };
