"use client";

import * as React from "react";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";

type DisclosureProps = {
  /** Label yang selalu terlihat; klik untuk membuka isi. */
  summary: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
};

/**
 * Bagian yang bisa dilipat untuk detail sekunder (penjelasan teknis, catatan
 * keamanan, bantuan). Tujuannya mengurangi teks yang harus dibaca sekaligus
 * tanpa menghilangkan informasinya.
 */
export function Disclosure({
  summary,
  children,
  className,
  defaultOpen = false,
}: DisclosureProps) {
  return (
    <CollapsiblePrimitive.Root defaultOpen={defaultOpen} className={className}>
      <CollapsiblePrimitive.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-2 text-left text-sm text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
        <span>{summary}</span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180"
          aria-hidden
        />
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Panel className="pt-2 text-sm leading-relaxed text-foreground/70">
        {children}
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  );
}

