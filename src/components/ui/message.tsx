import * as React from "react"

import { cn } from "@/lib/utils"
import type { Tone } from "@/lib/admin"

/**
 * Kotak pesan inline (error / sukses / info), pengganti pola yang sebelumnya
 * disalin-tempel di banyak form: `rounded-base border-2 border-border px-3
 * py-2 text-sm` + logika "warna apa ini?" yang diulang tiap berkas.
 *
 * Nada:
 *   good, hijau (submit/tes berhasil)
 *   bad, merah/menonjol (gagal, perlu tindakan)
 *   neutral, abu-abu (informasi, tanpa menghakimi)
 *
 * `role` & `aria-live` sudah diisi agar pembaca layar mengumumkan pesan yang
 * muncul setelah aksi (form submit) tanpa perlu diatur per pemanggil.
 */
const TONE_CLASS: Record<Tone, string> = {
  good: "bg-main text-main-foreground",
  bad: "border-destructive text-foreground",
  neutral: "bg-background text-foreground",
}

function Message({
  className,
  tone = "neutral",
  as: Component = "p",
  ...props
}: React.ComponentProps<"p"> & { tone?: Tone; as?: "p" | "div" }) {
  return (
    <Component
      data-slot="message"
      data-tone={tone}
      role={tone === "bad" ? "alert" : "status"}
      aria-live={tone === "bad" ? "assertive" : "polite"}
      className={cn(
        "rounded-base border-2 border-border px-3 py-2 text-sm font-base",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    />
  )
}

export { Message }
