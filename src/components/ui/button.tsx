import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // `cursor-pointer`: Tailwind v4 mengubah default `button` menjadi
  // `cursor: default`, jadi tanpa ini tombol tampak tidak bisa diklik.
  // `touch-action-manipulation` menghapus delay 300ms tap di layar sentuh.
  // Keduanya memenuhi aturan ui-ux-pro-max `cursor-pointer` + `tap-delay`.
  "inline-flex cursor-pointer touch-manipulation items-center justify-center whitespace-nowrap rounded-base text-sm font-base ring-offset-background transition-all gap-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "text-main-foreground bg-main border-2 border-border shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        noShadow: "text-main-foreground bg-main border-2 border-border",
        neutral:
          "bg-secondary-background text-foreground border-2 border-border shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        reverse:
          "text-main-foreground bg-main border-2 border-border hover:translate-x-reverseBoxShadowX hover:translate-y-reverseBoxShadowY hover:shadow-shadow",
      },
      size: {
        default: "h-10 px-4 py-2",
        xs: "h-8 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "size-10",
        "icon-xs": "size-8 [&_svg]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  nativeButton,
  render,
  ...props
}: React.ComponentProps<typeof ButtonPrimitive> &
  VariantProps<typeof buttonVariants>) {
  // Base UI mengasumsikan komponen ini selalu <button>. Di proyek ini `render`
  // kerap diisi <Link> (yaitu <a>), yang memicu peringatan semantik tombol.
  // Jadi bila `render` diberikan, kita matikan nativeButton secara default;
  // pemanggil tetap bisa menimpanya eksplisit dengan nativeButton={true}.
  return (
    <ButtonPrimitive
      data-slot="button"
      nativeButton={nativeButton ?? render == null}
      render={render}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
