import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({
  className,
  style,
  ...props
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground w-full min-w-0 rounded-md border border-sketch px-3 py-2 text-base font-mono shadow-xs transition-[color,box-shadow] outline-none resize-none min-h-[120px] max-h-[300px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      style={{ backgroundColor: 'var(--color-input-background)', ...style }}
      {...props} />
  );
}

export { Textarea }
