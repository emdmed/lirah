import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-primary focus-visible:-outline-offset-1 aria-invalid:text-destructive",
  {
    variants: {
      variant: {
        default: "tui-btn bg-primary text-primary-foreground hover:bg-primary/85",
        destructive:
          "tui-btn text-destructive hover:bg-destructive hover:text-destructive-foreground",
        outline:
          "tui-btn bg-transparent hover:bg-foreground hover:text-background",
        secondary:
          "tui-btn text-muted-foreground hover:bg-foreground hover:text-background",
        ghost:
          "tui-btn hover:bg-foreground hover:text-background",
        link: "text-primary underline underline-offset-4 hover:bg-primary hover:text-primary-foreground hover:no-underline",
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
