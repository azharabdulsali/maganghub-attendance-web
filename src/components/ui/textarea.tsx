import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Textarea resmi dari registry neobrutalism-components (`textarea`).
 *
 * Disalin lewat `npx shadcn@latest add <url-neobrutalism>`, lalu hanya token
 * warna fokusnya diselaraskan dengan tema proyek (`ring-ring`/`ring-offset-2`
 * alih-alih `ring-black`) agar gelap/terang tetap konsisten (DESIGN.md).
 * Memakai `React.ComponentProps<"textarea">` supaya semua atribut HTML asli
 * (termasuk `rows` dan `maxLength`) terus bekerja apa adanya.
 */
function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-base border-2 border-border bg-secondary-background selection:bg-main selection:text-main-foreground px-3 py-2 text-sm font-base text-foreground placeholder:text-foreground/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
