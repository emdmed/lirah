import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, NavArrowRight, Circle } from "iconoir-react"

import { cn } from "@/lib/utils"
import { Keycap } from "@/components/instrument/Keycap"

// Focus (keyboard and pointer) is a 1px inset ink outline, not a tint, so the
// row keeps its colours; a destructive item stays in fault while focused.
const FOCUS =
  "focus:text-foreground focus:shadow-[inset_0_0_0_1px_var(--ins-legend)] data-[highlighted]:shadow-[inset_0_0_0_1px_var(--ins-legend)]"

const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.Sub

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      `flex cursor-default select-none items-center gap-2 rounded-none px-2 py-1.5 text-sm outline-none ${FOCUS} data-[state=open]:text-foreground data-[state=open]:shadow-[inset_0_0_0_1px_var(--ins-legend)] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0`,
      inset && "pl-8",
      className
    )}
    {...props}>
    {children}
    <NavArrowRight className="ml-auto" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-none border-0 ins-veil p-1 text-popover-foreground font-mono",
      className
    )}
    {...props} />
))
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-none border-0 ins-veil p-1 text-popover-foreground font-mono",
        className
      )}
      {...props} />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

// `destructive` draws the label and icon in fault.
const DropdownMenuItem = React.forwardRef(({ className, inset, destructive, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      `relative flex cursor-default select-none items-center gap-2 rounded-none px-2 py-1.5 text-sm outline-none ${FOCUS} data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0`,
      inset && "pl-8",
      destructive && "text-[var(--ins-fault)] focus:text-[var(--ins-fault)] [&_svg]:text-[var(--ins-fault)]",
      className
    )}
    {...props} />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      `relative flex cursor-default select-none items-center rounded-none py-1.5 pl-8 pr-2 text-sm outline-none ${FOCUS} data-[disabled]:pointer-events-none data-[disabled]:opacity-50`,
      className
    )}
    checked={checked}
    {...props}>
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      `relative flex cursor-default select-none items-center rounded-none py-1.5 pl-8 pr-2 text-sm outline-none ${FOCUS} data-[disabled]:pointer-events-none data-[disabled]:opacity-50`,
      className
    )}
    {...props}>
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("ins-legend px-2 pt-2 pb-1 text-[11px] font-normal", inset && "pl-8", className)}
    {...props} />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

// `star` sets a faint star in the middle of the hairline, as the chrome rows
// separate groups. Use it only in chrome menus (the status-bar settings menu).
const DropdownMenuSeparator = React.forwardRef(({ className, star, ...props }, ref) => (
  star ? (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1.5 flex items-center gap-1.5", className)}
      {...props}>
      <span className="h-px flex-1 bg-[var(--tui-line)]" />
      <span className="ins-sep-star" aria-hidden="true" />
      <span className="h-px flex-1 bg-[var(--tui-line)]" />
    </DropdownMenuPrimitive.Separator>
  ) : (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-[var(--tui-line)]", className)}
      {...props} />
  )
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

// A shortcut at the row's end. Pass `keys` (compact keys from
// src/lib/shortcuts.js) to draw keycaps; plain children print as text.
const DropdownMenuShortcut = ({
  className,
  keys,
  children,
  ...props
}) => {
  if (keys?.length) {
    return (
      <span className={cn("ml-auto inline-flex items-center gap-[3px] pl-3", className)} {...props}>
        {keys.map((k, i) => <Keycap key={i} size="sm">{k}</Keycap>)}
      </span>
    );
  }
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}>
      {children}
    </span>
  );
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}
