import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1 aria-invalid:text-destructive",
  {
    variants: {
      variant: {
        // Every variant but `link` is a printed key (.ins-key, see index.css):
        // no box, brightens on hover, tinted while pressed/open.
        default: "ins-key ins-key-primary ins-round",
        destructive: "ins-key ins-key-danger ins-round",
        outline: "ins-key ins-round",
        secondary: "ins-key ins-round text-muted-foreground",
        ghost: "ins-key ins-round",
        link: "ins-link text-primary",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 px-2 py-0.5 text-xs gap-1 has-[>svg]:px-1.5",
        sm: "h-8 gap-1.5 p-1 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
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
  ...props
}) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props} />
  );
}

export { Button, buttonVariants }
