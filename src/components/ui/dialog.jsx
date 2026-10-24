"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

import { cn } from "@/lib/utils"
import { Keycap } from "@/components/instrument/Keycap"
import { FrameHints } from "@/components/instrument/FrameHints"
import { Lamp } from "@/components/instrument/Lamp"
import { DialogScopeContext } from "@/features/dialogs/dialogStore"

// What DialogContent tells DialogTitle to draw beside the title in the frame
// legend: the shortcut that opened the dialog and its lamp.
const ShellContext = React.createContext(null)

// A dialog opened from a tab follows that tab: while another tab is active it
// is closed on screen (its component and state stay mounted) and it comes
// back when you return. Only controlled dialogs are gated.
function Dialog({
  open,
  ...props
}) {
  const scope = React.useContext(DialogScopeContext)
  const shown = open !== undefined && scope && !scope.active ? false : open
  return <DialogPrimitive.Root data-slot="dialog" open={shown} {...props} />;
}

function DialogTrigger({
  ...props
}) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose({
  ...props
}) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogPortal({
  ...props
}) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/60",
        className
      )}
      {...props} />
  );
}

const SIZES = {
  sm: "max-w-[440px]",
  md: "max-w-[540px]",
  lg: "max-w-[720px]",
  xl: "max-w-[960px]",
  full: "max-w-[calc(100vw-24px)] h-[calc(100vh-24px)]",
}

// A dialog is a pane floating over the app, drawn like the focused pane:
//
//   ┌─ ^T NEW TAB ✦ ─────────────── status ┐
//   │ body                                 │
//   └──────── ↑ ↓ move ✦ ↵ open ✦ esc close┘
//
// keys    shortcut that opens it, as a lit keycap in the legend (['^','T'])
// lamp    'on' (default) | 'blink' while work runs | 'ok' | 'warn' | 'fault' | null
// status  short text or a Scanner in the top-right corner of the frame
// hints   [{ keys: ['↵'], label: 'open' }, …] set into the bottom frame line;
//         a clickable esc cap is always appended (escLabel, default "close")
// size    sm 440 | md 540 | lg 720 | xl 960 | full (window minus the gutter)
// tone    'fault' for destructive confirms: fault hairline and fault star
function DialogContent({
  className,
  children,
  overlayClassName,
  instant,
  size,
  tone,
  keys,
  lamp,
  status,
  hints,
  escLabel = "close",
  ...props
}) {
  const shell = React.useMemo(
    () => ({ keys, lamp: lamp === undefined ? (tone === "fault" ? "fault" : "on") : lamp }),
    [keys, lamp, tone]
  )
  const hintList = Array.isArray(hints) ? hints : []
  return (
    <DialogPortal>
      <DialogOverlay className={instant ? "!animate-none" : overlayClassName} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <DialogPrimitive.Content
          data-slot="dialog-content"
          data-instant={instant || undefined}
          data-tone={tone || undefined}
          className={cn(
            "tui-pane tui-dialog grid w-full max-w-lg gap-4 px-5 font-mono",
            size && SIZES[size],
            className
          )}
          {...props}>
          <ShellContext.Provider value={shell}>
            {children}
          </ShellContext.Provider>
          {status != null && (
            <span className="tui-frame-status">{status}</span>
          )}
          <span className="tui-pane-info tui-frame-hints">
            <FrameHints hints={hintList}>
              <span className="tui-frame-hint">
                <DialogPrimitive.Close className="ins-cap ins-round" data-size="sm">
                  esc
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
                <span aria-hidden="true">{escLabel}</span>
              </span>
            </FrameHints>
          </span>
        </DialogPrimitive.Content>
      </div>
    </DialogPortal>
  );
}

function DialogHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props} />
  );
}

// Actions sit right-aligned, primary last. Text-only buttons print as
// `[label]` (see .tui-dialog in index.css). Pickers have none: Enter acts.
function DialogFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end", className)}
      {...props} />
  );
}

function legendLamp(lamp) {
  if (!lamp) return null
  if (lamp === "blink") return <Lamp state="on" blink />
  return <Lamp state={lamp} />
}

function DialogTitle({
  className,
  children,
  ...props
}) {
  const shell = React.useContext(ShellContext)
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("ins-legend text-foreground", className)}
      {...props}>
      {shell?.keys?.length > 0 && (
        <Keycap size="sm" lit>{joinKeys(shell.keys)}</Keycap>
      )}
      {children}
      {shell && legendLamp(shell.lamp)}
    </DialogPrimitive.Title>
  );
}

function DialogDescription({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props} />
  );
}

// A group label in the body: a legend followed by a hairline, in place of a
// box around the group.
function DialogGroup({ label, className, children }) {
  return (
    <div className={cn("tui-dialog-group", className)}>
      <span className="ins-legend">{label}</span>
      {children}
    </div>
  );
}

// An empty list: a faint star and one line saying how to fill it.
function DialogEmpty({ className, children }) {
  return (
    <p className={cn("tui-dialog-empty", className)}>
      <span className="tui-dialog-empty-star" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogGroup,
  DialogEmpty,
}
