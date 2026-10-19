import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface InlineSkeletonProps {
  /** Number of placeholder cards to render while data loads. */
  count?: number
  label?: string
}

export function InlineSkeleton({ count = 3, label = 'Loading' }: InlineSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="rounded-xl bg-card border border-border p-4 space-y-4 animate-pulse"
        >
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-muted" />
            <div className="space-y-2">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-2 w-24 rounded bg-muted" />
            </div>
          </div>
          <div className="h-8 w-full rounded bg-muted" />
          <div className="flex justify-between">
            <div className="h-5 w-20 rounded bg-muted" />
            <div className="h-5 w-16 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

interface InlineEmptyProps {
  title: string
  description: string
  action?: React.ReactNode
}

export function InlineEmpty({ title, description, action }: InlineEmptyProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="flex justify-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Inbox size={22} className="text-muted-foreground" />
        </div>
      </div>
      <p className="mt-4 font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

interface InlineErrorProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function InlineError({ title = 'Something went wrong', message, onRetry }: InlineErrorProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 flex gap-3"
    >
      <AlertTriangle size={20} className="text-destructive flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}
