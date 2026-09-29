'use client'

import * as React from 'react'
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

type SheetSide = 'top' | 'right' | 'bottom' | 'left'

const SIDE_CLASSES: Record<SheetSide, string> = {
  top: 'inset-x-0 top-0 max-h-[80vh] border-b data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full',
  bottom:
    'inset-x-0 bottom-0 max-h-[80vh] rounded-t-xl border-t data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
  left: 'inset-y-0 left-0 w-3/4 max-w-sm border-r data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full',
  right:
    'inset-y-0 right-0 w-3/4 max-w-sm border-l data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full',
}

/**
 * Issue #654. While a `Backdrop` part is rendered, Base UI resolves its
 * `outsidePressEvent` to `'intentional'`, which means the drawer is only
 * dismissed by a synthesized `click` on the backdrop element. Android Chrome
 * does not reliably deliver that click after a touch that drifts by a few
 * pixels, so the tap did nothing and the sheet stayed open. The backdrop is
 * therefore a press surface in its own right: it closes on the pointer sequence
 * it actually receives and the built-in click path is left in place.
 *
 * `min-h-dvh` keeps the surface over the whole visible viewport (a tap target
 * far above the 44px minimum) while the sheet animates, and `touch-manipulation`
 * drops the legacy double-tap-zoom delay. Nothing is added to the popup, so
 * scrolling inside the sheet is untouched.
 */
const BACKDROP_CLASSES =
  'fixed inset-0 z-50 min-h-dvh touch-manipulation bg-black/60 transition-opacity duration-300 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0'

interface SheetContextValue {
  /** Closes the drawer through Base UI's imperative action so `onOpenChange` runs. */
  closeSheet: () => void
  /** Mirrors `Drawer.Root`'s `disablePointerDismissal` for the backdrop press. */
  dismissOnBackdropPress: boolean
}

const SheetContext = React.createContext<SheetContextValue | null>(null)

function Sheet({
  actionsRef,
  disablePointerDismissal = false,
  children,
  ...props
}: DrawerPrimitive.Root.Props) {
  const actions = React.useRef<DrawerPrimitive.Root.Actions | null>(null)

  // Hold Base UI's imperative handle for the backdrop, and keep forwarding it to
  // a caller-supplied `actionsRef` so the public API does not change.
  React.useImperativeHandle(
    actionsRef,
    () => ({
      unmount: () => actions.current?.unmount(),
      close: () => actions.current?.close(),
    }),
    [],
  )

  const context = React.useMemo<SheetContextValue>(
    () => ({
      closeSheet: () => actions.current?.close(),
      dismissOnBackdropPress: !disablePointerDismissal,
    }),
    [disablePointerDismissal],
  )

  return (
    <SheetContext.Provider value={context}>
      <DrawerPrimitive.Root
        actionsRef={actions}
        disablePointerDismissal={disablePointerDismissal}
        {...props}
      >
        {children}
      </DrawerPrimitive.Root>
    </SheetContext.Provider>
  )
}

function SheetTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="sheet-close" {...props} />
}

interface SheetContentProps extends DrawerPrimitive.Popup.Props {
  side?: SheetSide
  showCloseButton?: boolean
}

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: SheetContentProps) {
  const sheet = React.useContext(SheetContext)

  // The pointer that went down on the backdrop, cleared on end, cancel and out,
  // so a press that began inside the popup — or moved off the backdrop — can
  // never be mistaken for a backdrop tap.
  const backdropPress = React.useRef<{ pointerId: number | undefined } | null>(null)

  function handleBackdropPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    backdropPress.current = { pointerId: event.pointerId }
  }

  function handleBackdropPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const press = backdropPress.current
    backdropPress.current = null

    if (!press || press.pointerId !== event.pointerId) {
      return
    }

    if (sheet?.dismissOnBackdropPress) {
      sheet.closeSheet()
    }
  }

  function handleBackdropPointerEnd() {
    backdropPress.current = null
  }

  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop
        data-slot="sheet-backdrop"
        className={BACKDROP_CLASSES}
        onPointerDown={handleBackdropPointerDown}
        onPointerUp={handleBackdropPointerUp}
        onPointerCancel={handleBackdropPointerEnd}
        onPointerOut={handleBackdropPointerEnd}
      />
      <DrawerPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col gap-4 border-border bg-card p-6 text-card-foreground shadow-lg',
          'transition-transform duration-300 ease-out',
          SIDE_CLASSES[side],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DrawerPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-4" />
          </DrawerPrimitive.Close>
        )}
      </DrawerPrimitive.Popup>
    </DrawerPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 pr-6', className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2', className)} {...props} />
  )
}

function SheetTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-lg font-semibold text-foreground', className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
