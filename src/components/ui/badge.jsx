import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center border px-1.5 py-0 text-xs font-normal focus:outline-1 focus:outline-solid focus:outline-primary",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-foreground/15 text-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-primary text-primary",
        success:
          "border-transparent bg-primary/15 text-primary",
        info:
          "border-transparent bg-accent/15 text-accent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
