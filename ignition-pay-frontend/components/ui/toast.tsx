'use client'

import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Wrap the app (or a subtree) to enable `useToast()`. */
function ToastProvider(props: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

/**
 * Renders queued toasts. Place once inside the provider, typically next to the
 * app shell so toasts survive route changes.
 */
function Toaster({ className, ...props }: ToastPrimitive.Viewport.Props) {
  const { toasts } = ToastPrimitive.useToastManager()

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toaster"
        className={cn(
          'fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2',
          className,
        )}
        {...props}
      >
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            toast={toast}
            data-slot="toast"
            className={cn(
              'flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg',
              'transition-all duration-200 data-[starting-style]:translate-x-full data-[starting-style]:opacity-0',
              'data-[ending-style]:translate-x-full data-[ending-style]:opacity-0',
              toast.type === 'error' && 'border-destructive/40',
              toast.type === 'success' && 'border-green-500/40',
            )}
          >
            <div className="flex-1 space-y-1">
              <ToastPrimitive.Title className="text-sm font-semibold text-foreground" />
              <ToastPrimitive.Description className="text-sm text-muted-foreground" />
            </div>
            <ToastPrimitive.Close
              aria-label="Dismiss notification"
              className="rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <X className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  )
}

/** `const toast = useToast(); toast.add({ title: 'Sent' })` */
const useToast = ToastPrimitive.useToastManager

export { ToastProvider, Toaster, useToast }
