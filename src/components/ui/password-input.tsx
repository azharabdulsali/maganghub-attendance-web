"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Kolom kata sandi dengan tombol "tampilkan/sembunyikan".
 *
 * Kenapa perlu: kata sandi harus diketik persis, dan tanpa cara melihatnya
 * pengguna sering salah ketik, terutama pada kolom konfirmasi dan saat
 * menempel (paste) kata sandi dari pengelola kata sandi. Tombol ini bawaan
 * banyak formulir modern, jadi ketiadaannya terasa "kurang".
 *
 * Kenapa BUKAN tipe="text" yang di-toggle di tempat: kita tetap mengubah
 * `type` elemen yang sama (bukan mengganti elemen) supaya fokus, nilai, dan
 * posisi kursor tidak hilang saat tombol ditekan.
 *
 * Keamanan: nilai kata sandi tidak pernah dicatat/di-log. Semua prop lain
 * diteruskan apa adanya ke `<Input>`, jadi `id`, `aria-invalid`,
 * `aria-describedby`, `autoComplete`, dsb. tetap berfungsi, lihat
 * docs/UI-LAYOUT.md §5b.
 */
function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [terlihat, setTerlihat] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={terlihat ? "text" : "password"}
        // Ruang ekstra di kanan supaya teks tidak tertimpa tombol.
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        // Bukan tombol submit, hanya mengalihkan visibilitas. `tabIndex`
        // dibiarkan default agar tetap terjangkau lewat keyboard.
        onClick={() => setTerlihat((v) => !v)}
        aria-label={terlihat ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        aria-pressed={terlihat}
        title={terlihat ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-base text-foreground/70 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
      >
        {terlihat ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

export { PasswordInput };
