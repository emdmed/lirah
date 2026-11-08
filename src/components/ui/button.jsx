import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"
import { Scanner } from "@/components/instrument/Scanner"

// The one button recipe. Material (frame, fill, hover, focus, on-state) lives
// in the .ins-key-* classes in index.css; this only picks the role and size.
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap shrink-0 ins-key ins-round disabled:pointer-events-none disabled:not-aria-busy:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 aria-invalid:text-destructive",
  {
    variants: {
      variant: {
        default: "ins-key-primary",
        outline: "ins-key-outline",
        ghost: "ins-key-ghost",
        // shortcut: alias of ghost for the one remaining site; remove in chunk 5.
        secondary: "ins-key-ghost",
        destructive: "ins-key-danger",
        "destructive-fill": "ins-key-danger-fill",
        link: "ins-link text-primary",
      },
      size: {
        panel: "ins-key-panel",
        "icon-panel": "ins-key-panel",
        xs: "h-6 px-2 py-0.5 text-xs gap-1 has-[>svg]:px-1.5",
        sm: "h-8 px-2.5 text-xs gap-1.5 has-[>svg]:px-2",
        default: "h-9 px-4 py-2 text-[13px] gap-2 has-[>svg]:px-3",
        lg: "h-10 px-6 text-[13px] gap-2 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 p-0.5",
        "icon-sm": "size-8 p-1",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  busy = false,
  disabled,
  children,
  ...props
}) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-icon-only={size === "icon-panel" ? "" : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}>
      {busy && <Scanner size="sm" />}
      {children}
    </Comp>
  );
}

export { Button, buttonVariants }
