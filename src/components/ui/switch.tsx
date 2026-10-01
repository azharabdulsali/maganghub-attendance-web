import * as React from "react";

import { cn } from "@/lib/utils";

// Sakelar on/off berbasis <button> native dengan `role="switch"`.
//
// Kenapa bukan input checkbox yang distyling, dan bukan Radix Switch:
//  - `role="switch"` + `aria-checked` memberi screen reader status on/off
//    secara eksplisit (lebih tepat daripada checkbox untuk pengaturan langsung
//    berlaku seperti "aktifkan otomasi"). Spasi/Enter tetap bekerja karena ini
//    <button> asli, jadi tidak ada handler tombol yang perlu ditulis manual.
//  - Tanpa dependensi baru: `@radix-ui/react-switch` ada di node_modules
//    hanya sebagai dependensi transitif paket `radix-ui` (bukan di
//    package.json), memakainya langsung = phantom dependency yang bisa pecah
//    saat versi `radix-ui` naik. Proyek ini juga memakai elemen native +
//    token untuk komponen dasar (lihat input.tsx, select.tsx).
//
// Warna memakai token tema dan sengaja mengikuti komposisi yang SUDAH terbukti
// kontras di proyek ini:
//  - lintasan mati  : `bg-input` (terang abu, gelap putih 40%)
//  - lintasan hidup : `bg-main` (aksen biru)
//  - kenop          : `bg-background` (terang: biru pucat; gelap: kanvas)
//  - kenop saat hidup: `bg-main-foreground` — token ini MEMANG disetel untuk
//    teks/glyph di atas `bg-main` (di mode gelap nyaris hitam) dan sudah
//    terbukti kontras 7:1, jadi kenop tetap terlihat di kedua tema.
//
// Catatan: ini HANYA untuk sakelar yang dikontrol state React. Bila JS mati,
// sakelar tidak bisa diubah — karena itu formnya tetap punya tombol submit
// biasa dan status awal tetap dibaca dari server. Jangan pakai komponen ini
// sebagai satu-satunya cara input pada form yang harus jalan tanpa JS.
type SwitchProps = Omit<
  React.ComponentProps<"button">,
  "role" | "onChange" | "children"
> & {
  /** Status aktif. Dikontrol penuh oleh pemanggil (controlled). */
  checked?: boolean;
  /** Dipanggil dengan status BARU (bukan event), seperti konvensi Radix. */
  onCheckedChange?: (checked: boolean) => void;
};

function Switch({
  className,
  checked = false,
  onCheckedChange,
  onClick,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      data-slot="switch"
      // `data-state` + `aria-checked` WAJIB diturunkan dari `checked`: itulah
      // yang membuat CSS varian (`data-[state=checked]:…`) dan screen reader
      // tahu statusnya. Tanpa ini sakelar tampak tidak berfungsi.
      data-state={checked ? "checked" : "unchecked"}
      aria-checked={checked}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        onCheckedChange?.(!checked);
      }}
      className={cn(
        // Lintasan sakelar. `h-6 w-11` = ukuran sasaran sentuh yang nyaman.
        "group peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-border p-0.5 transition-colors",
        "bg-input",
        "data-[state=checked]:bg-main",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {/* Kenop. Bergeser lewat `translate` saat aktif — dianimasikan agar
          perubahan status terasa, bukan melompat. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform",
          "group-data-[state=checked]:bg-main-foreground",
          // `group-data-[...]`: `data-state` ada di tombol INDUK, jadi varian
          // harus di-scope ke grup (`group` sudah dipasang di tombol).
          "translate-x-0 group-data-[state=checked]:translate-x-5",
        )}
      />
    </button>
  );
}

export { Switch };
