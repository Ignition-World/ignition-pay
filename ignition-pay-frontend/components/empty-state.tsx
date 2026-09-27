'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type EmptyStateIllustration = 'history' | 'send' | 'receive'

interface EmptyStateAction {
  label: string
  href: string
}

export interface EmptyStateProps {
  /** Which inline SVG illustration to render. Defaults to `history`. */
  illustration?: EmptyStateIllustration
  title: string
  description: string
  /** Optional call-to-action rendered as a primary button. */
  action?: EmptyStateAction
  className?: string
}

/**
 * Decorative SVGs use the theme's `primary`/`muted` tokens so the empty state
 * adapts to light, dark and high-contrast themes without extra variants.
 * Every illustration is marked `aria-hidden` — the heading carries the meaning.
 */
function HistoryIllustration() {
  return (
    <svg
      viewBox="0 0 200 140"
      className="h-32 w-44"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="40"
        y="18"
        width="120"
        height="104"
        rx="12"
        className="fill-primary/10 stroke-primary/40"
        strokeWidth="2"
      />
      <rect
        x="56"
        y="38"
        width="88"
        height="8"
        rx="4"
        className="fill-primary/40"
      />
      <rect
        x="56"
        y="58"
        width="64"
        height="8"
        rx="4"
        className="fill-muted-foreground/40"
      />
      <rect
        x="56"
        y="78"
        width="76"
        height="8"
        rx="4"
        className="fill-muted-foreground/40"
      />
      <rect
        x="56"
        y="98"
        width="48"
        height="8"
        rx="4"
        className="fill-muted-foreground/40"
      />
      <circle
        cx="150"
        cy="104"
        r="20"
        className="fill-background stroke-primary"
        strokeWidth="2"
      />
      <path
        d="M150 94v10l7 5"
        className="stroke-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function SendIllustration() {
  return (
    <svg
      viewBox="0 0 200 140"
      className="h-32 w-44"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M38 104C64 92 84 78 100 60"
        className="stroke-muted-foreground/40"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="2 10"
        fill="none"
      />
      <path
        d="M126 22 58 74l30 8 6 30 32-90Z"
        className="fill-primary/15 stroke-primary"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M88 82 126 22 58 74Z" className="fill-primary/30" />
      <circle
        cx="154"
        cy="96"
        r="18"
        className="fill-background stroke-primary/60"
        strokeWidth="2"
      />
      <path
        d="M154 88v16M147 97l7 7 7-7"
        className="stroke-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function ReceiveIllustration() {
  return (
    <svg
      viewBox="0 0 200 140"
      className="h-32 w-44"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="52"
        y="20"
        width="72"
        height="72"
        rx="10"
        className="fill-primary/10 stroke-primary/40"
        strokeWidth="2"
      />
      <rect
        x="62"
        y="30"
        width="22"
        height="22"
        rx="4"
        className="fill-primary/40"
      />
      <rect
        x="92"
        y="30"
        width="22"
        height="22"
        rx="4"
        className="fill-primary/40"
      />
      <rect
        x="62"
        y="60"
        width="22"
        height="22"
        rx="4"
        className="fill-primary/40"
      />
      <rect
        x="92"
        y="60"
        width="10"
        height="10"
        rx="2"
        className="fill-primary/40"
      />
      <path
        d="M84 108v18M76 119l8 8 8-8"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M50 112h-6a8 8 0 0 1-8-8v-2M138 102v2a8 8 0 0 1-8 8h-6"
        className="stroke-muted-foreground/50"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

const ILLUSTRATIONS: Record<EmptyStateIllustration, () => React.ReactElement> =
  {
    history: HistoryIllustration,
    send: SendIllustration,
    receive: ReceiveIllustration,
  }

export function EmptyState({
  illustration = 'history',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const Illustration = ILLUSTRATIONS[illustration]

  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center sm:p-12',
        className,
      )}
    >
      <Illustration />
      <h2 className="mt-6 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {action && (
        <div className="mt-6">
          <Link href={action.href}>
            <Button>{action.label}</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
