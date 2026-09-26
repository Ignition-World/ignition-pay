'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export interface SwitchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  /** Called with the next checked value when the switch is toggled. */
  onCheckedChange?: (checked: boolean) => void
}

/**
 * Accessible switch built on a native checkbox (`role="switch"`). Styling uses
 * the theme's `primary`/`muted` tokens so it works across light, dark and
 * high-contrast themes. Label the control with `aria-label` or
 * `aria-labelledby` from the caller.
 */
export function Switch({
  className,
  onCheckedChange,
  disabled,
  ...props
}: SwitchProps) {
  return (
    <label
      className={cn(
        'relative inline-flex shrink-0 items-center',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        disabled={disabled}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        {...props}
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-5"
      />
    </label>
  )
}
