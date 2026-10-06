"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import * as React from "react"

import { cn } from "@/lib/utils"

// Sakelar on/off resmi dari registry neobrutalism-components (Base UI Switch).
//
// Sebelumnya komponen ini ditulis tangan dengan `<button role="switch">`.
// Kini memakai primitif Base UI supaya perilaku papan ketik, ARIA, dan
// `data-checked`/`data-unchecked` gratis dari pustaka, sementara gaya tetap
// memakai token tema proyek (`bg-main`, `border-border`, `ring-ring`).
//
// Catatan: ini HANYA untuk sakelar yang dikontrol state React. Bila JS mati,
// sakelar tidak bisa diubah — karena itu formnya tetap punya tombol submit
// biasa dan status awal tetap dibaca dari server (lihat automation-form.tsx).
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "group/switch peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-border bg-secondary-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-disabled:cursor-not-allowed data-disabled:opacity-50 data-checked:bg-main data-unchecked:bg-input",
        size === "default" && "h-6 w-12",
        size === "sm" && "h-5 w-9",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full border-2 border-border bg-background ring-0 transition-transform data-unchecked:translate-x-1 data-checked:bg-main-foreground",
          size === "default" && "h-4 w-4 data-checked:translate-x-6",
          size === "sm" && "h-3 w-3 data-checked:translate-x-4",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
