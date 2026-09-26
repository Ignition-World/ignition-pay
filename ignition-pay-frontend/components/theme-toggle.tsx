'use client'

import { useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/hooks/use-theme'
import type { ThemeMode } from '@/lib/theme'
import { cn } from '@/lib/utils'

const modeIcon: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const modeLabel: Record<ThemeMode, string> = {
  light: 'Light mode',
  dark: 'Dark mode',
  system: 'System theme',
}

const modeAriaLabel: Record<ThemeMode, string> = {
  light: 'Switch to dark mode',
  dark: 'Switch to system theme',
  system: 'Switch to light mode',
}

const modeOrder: ThemeMode[] = ['light', 'dark', 'system']


const modes: { value: ThemeMode; icon: typeof Sun; label: string; shortLabel: string }[] = [
  { value: 'light', icon: Sun, label: 'Light mode', shortLabel: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark mode', shortLabel: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System theme', shortLabel: 'System' },
]

export function ThemeToggle() {
  const { mode, setMode, hydrated } = useTheme()

  if (!hydrated) {
    return (
      <div
        role="radiogroup"
        aria-label="Theme selector"
        className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 opacity-0"
      >
        {modes.map((m) => {
          const Icon = m.icon
          return (
            <div
              key={m.value}
              className="flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium"
            >
              <Icon size={16} aria-hidden="true" />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme selector"
      aria-orientation="horizontal"
      className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 shadow-sm"
    >
      {modes.map((m) => {
        const Icon = m.icon
        const isActive = mode === m.value
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={m.label}
            title={m.label}
            onClick={() => setMode(m.value)}
            className={cn(
              'relative flex h-8 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-all duration-200',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              isActive
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
            )}
          >
            <Icon size={16} aria-hidden="true" />
            <span className="hidden sm:inline whitespace-nowrap">{m.shortLabel}</span>
          </button>
        )
      })}
    </div>
  )
}

export default ThemeToggle
