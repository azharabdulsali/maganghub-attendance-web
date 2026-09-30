import * as React from "react"

import { cn } from "@/lib/utils"
import type { Tone } from "@/lib/admin"
import type { BadgeVariant } from "@/lib/audit-log"

/**
 * Satu-satunya tempat pemetaan "nada" (good/bad/neutral) ke kelas Tailwind.
 *
 * Sebelumnya peta ini tersalin tiga kali (history/page.tsx sebagai
 * `BADGE_CLASS`, admin/page.tsx sebagai `BADGE_CLASS` + `TONE_CLASS`) dan
 * markup <span> badge disalin empat kali. Bila nada berubah, dua halaman bisa
 * berbeda diam-diam. Kini keduanya memakai komponen ini.
 *
 * Nada memakai kosakata yang sama dengan `Tone` di lib/admin.ts supaya seluruh
 * proyek hanya punya SATU daftar nama warna.
 */
const TONE_CLASS: Record<Tone, string> = {
  good: "bg-main text-main-foreground",
  bad: "bg-foreground text-background",
  neutral: "bg-secondary-background text-foreground",
}

/**
 * Terjemahkan `BadgeVariant` (kosakata lib/audit-log.ts: success/failure/warning)
 * ke `Tone` (kosakata komponen ini: good/bad/neutral). Ditaruh di sini, bukan
 * di halaman, supaya tabel audit di riwayat & admin tidak pernah berbeda warna.
 */
export function toneForBadgeVariant(variant: BadgeVariant): Tone {
  switch (variant) {
    case "success":
      return "good"
    case "failure":
      return "bad"
    default:
      return "neutral"
  }
}

function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-base border-2 border-border px-2 py-0.5 text-xs font-heading",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    />
  )
}

export { Badge, TONE_CLASS }
