'use client'

import { useRateLimit } from '@/hooks/use-rate-limit'
import { AlertCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function RateLimitIndicator() {
  const rateLimit = useRateLimit()

  if (!rateLimit.isNearLimit && !rateLimit.isRateLimited) {
    return null
  }

  const formatResetTime = (resetAt: number | null) => {
    if (!resetAt) return 'Unknown'
    const seconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.ceil(seconds / 60)
    return `${minutes}m`
  }

  const getVariant = () => {
    if (rateLimit.isRateLimited) return 'destructive'
    if (rateLimit.isNearLimit) return 'warning'
    return 'default'
  }

  const getMessage = () => {
    if (rateLimit.isRateLimited) {
      return `Rate limit reached. Resets in ${formatResetTime(rateLimit.resetAt)}`
    }
    return `${rateLimit.remaining}/${rateLimit.limit} requests remaining. Resets in ${formatResetTime(rateLimit.resetAt)}`
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
        rateLimit.isRateLimited
          ? 'bg-destructive/10 text-destructive border border-destructive/30'
          : 'bg-warning/10 text-warning-foreground border border-warning/30'
      }`}
      role="alert"
      aria-live="polite"
    >
      {rateLimit.isRateLimited ? (
        <AlertCircle size={16} className="flex-shrink-0" />
      ) : (
        <Clock size={16} className="flex-shrink-0" />
      )}
      <span className="flex-1">{getMessage()}</span>
    </div>
  )
}
