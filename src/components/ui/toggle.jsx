import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"

import { buttonVariants } from "@/components/ui/button"

// A toggle is a ghost key; its on-state (data-state="on") comes from .ins-key.
const toggleVariants = ({ size, className } = {}) =>
  buttonVariants({ variant: "ghost", size, className })

function Toggle({
  className,
  variant,
  size,
  ...props
}) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={toggleVariants({ size, className })}
      {...props} />
  );
}

export { Toggle, toggleVariants }
