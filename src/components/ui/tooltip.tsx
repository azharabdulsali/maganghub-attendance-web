"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

type InfoHintProps = {
  /** Teks bantuan singkat yang muncul saat ikon difokus atau di-hover. */
  children: React.ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
};

/**
 * Ikon info kecil dengan tooltip.
 *
 * Dipakai untuk memindahkan penjelasan panjang dari badan halaman ke balon
 * bantuan: pengguna yang sudah paham tidak perlu membaca, yang baru pertama
 * kali tetap bisa menemukan penjelasannya. Trigger-nya `<button>` asli dari
 * Base UI, jadi bisa dijangkau keyboard dan dibacakan pembaca layar.
 */
export function InfoHint({ children, className, side = "top" }: InfoHintProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        aria-label="Penjelasan"
        className={cn(
          "inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full text-foreground/50 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Info className="size-4" aria-hidden />
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={6} className="z-50">
          <TooltipPrimitive.Popup className="max-w-xs rounded-base border-2 border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground shadow-shadow">
            {children}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

