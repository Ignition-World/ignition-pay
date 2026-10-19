'use client'

import { useEffect } from 'react'

/**
 * Keyboard shortcuts for power users (issue #668).
 *
 * This module owns the shortcut table and the key matching; the global listener
 * is attached by {@link useKeyboardShortcuts}. Shortcuts are matched on
 * `keydown`, ignored while the user is typing in a field, and can be turned off
 * individually from Settings.
 */
export interface KeyboardShortcut {
  id: string
  /** Canonical display form, e.g. `Ctrl + S`. */
  keys: string
  label: string
  description: string
}

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  {
    id: 'help',
    keys: '?',
    label: 'Keyboard shortcuts',
    description: 'Open this help dialog',
  },
  {
    id: 'send',
    keys: 'Ctrl + S',
    label: 'Send',
    description: 'Open the send form, or review it while already on the send page',
  },
  {
    id: 'search',
    keys: '/',
    label: 'Search',
    description: 'Focus the transaction search field',
  },
  {
    id: 'close',
    keys: 'Escape',
    label: 'Close',
    description: 'Close the open dialog or sheet',
  },
] as const

/** Controls that swallow the keystrokes a shortcut would otherwise match. */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (EDITABLE_TAGS.has(target.tagName)) return true
  return target.isContentEditable === true
}

export interface ParsedShortcut {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
}

/** Splits `Ctrl + Shift + S` into its modifiers and the final key. */
export function parseShortcut(keys: string): ParsedShortcut {
  const parts = keys
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  return {
    key: parts.length > 0 ? parts[parts.length - 1] : '',
    ctrl: parts.some((part) => /^(ctrl|cmd|meta|command)$/i.test(part)),
    alt: parts.some((part) => /^alt$/i.test(part)),
    shift: parts.some((part) => /^shift$/i.test(part)),
  }
}

/**
 * True when the event satisfies the binding. `Ctrl` and `Cmd` are treated as
 * interchangeable so one table works on every OS, and `Shift` is only required
 * when the binding names it — `?` is `Shift + /` on some layouts and its own key
 * on others, and both produce `event.key === '?'`.
 */
export function matchesShortcut(event: KeyboardEvent, keys: string): boolean {
  const parsed = parseShortcut(keys)
  if (parsed.ctrl !== (event.ctrlKey || event.metaKey)) return false
  if (parsed.alt !== event.altKey) return false
  if (parsed.shift && !event.shiftKey) return false

  return event.key.toLowerCase() === parsed.key.toLowerCase()
}

export interface KeyboardShortcutHandlers {
  [id: string]: (() => void) | undefined
}

export interface UseKeyboardShortcutsOptions {
  /** Per-shortcut enable flags. A missing key means enabled. */
  enabled?: Record<string, boolean>
  /** Set to `false` to detach the listener entirely. */
  active?: boolean
}

/**
 * Attaches one global `keydown` listener that dispatches the configured
 * shortcuts. It is a no-op while focus is in a text field, so typing `?` into a
 * memo or an address never opens the help dialog.
 */
export function useKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  options: UseKeyboardShortcutsOptions = {},
): void {
  const { enabled, active = true } = options

  useEffect(() => {
    if (!active || typeof window === 'undefined') return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isEditableElement(event.target)) return

      for (const shortcut of KEYBOARD_SHORTCUTS) {
        if (enabled?.[shortcut.id] === false) continue

        const handler = handlers[shortcut.id]
        if (!handler) continue

        if (matchesShortcut(event, shortcut.keys)) {
          event.preventDefault()
          handler()
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers, enabled, active])
}
