'use client'

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  KEYBOARD_SHORTCUTS,
  useKeyboardShortcuts,
  type KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts'

const STORAGE_KEY = 'ignition-pay:keyboard-shortcuts'

/** Fixed ids so the dialog is named and described without relying on the primitive. */
const TITLE_ID = 'keyboard-shortcuts-title'
const DESCRIPTION_ID = 'keyboard-shortcuts-description'

type ShortcutPreferences = Record<string, boolean>

export interface KeyboardShortcutsContextValue {
  shortcuts: readonly KeyboardShortcut[]
  /** True unless the user turned the shortcut off in Settings. */
  isEnabled: (id: string) => boolean
  setEnabled: (id: string, enabled: boolean) => void
  openHelp: () => void
  closeHelp: () => void
  isHelpOpen: boolean
}

/**
 * A safe default so a surface (e.g. a settings section) can render outside the
 * provider in isolation without crashing. In the app the provider in the root
 * layout supplies the real, persisted preferences.
 */
const DEFAULT_CONTEXT: KeyboardShortcutsContextValue = {
  shortcuts: KEYBOARD_SHORTCUTS,
  isEnabled: () => true,
  setEnabled: () => {},
  openHelp: () => {},
  closeHelp: () => {},
  isHelpOpen: false,
}

const KeyboardShortcutsContext =
  createContext<KeyboardShortcutsContextValue>(DEFAULT_CONTEXT)

export function useKeyboardShortcutsContext(): KeyboardShortcutsContextValue {
  return useContext(KeyboardShortcutsContext)
}

function readPreferences(): ShortcutPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') return parsed as ShortcutPreferences
  } catch {
    // Corrupt or blocked storage: fall back to every shortcut enabled.
  }
  return {}
}

/** Renders a binding as key caps, e.g. `Ctrl` `+` `S`. */
export function KeyboardKeys({ keys }: { keys: string }) {
  const parts = keys.split('+').map((part) => part.trim())

  return (
    <span className="flex items-center gap-1" aria-label={keys}>
      {parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
          {index > 0 && (
            <span aria-hidden="true" className="text-xs text-muted-foreground">
              +
            </span>
          )}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {part}
          </kbd>
        </Fragment>
      ))}
    </span>
  )
}

interface KeyboardShortcutsHelpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shortcuts: readonly KeyboardShortcut[]
}

/**
 * The `?` help dialog. Lists every shortcut in keyboard format and carries the
 * short tutorial for using them.
 */
export function KeyboardShortcutsHelpDialog({
  open,
  onOpenChange,
  shortcuts,
}: KeyboardShortcutsHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-labelledby={TITLE_ID} aria-describedby={DESCRIPTION_ID}>
        <DialogHeader>
          <DialogTitle id={TITLE_ID} className="flex items-center gap-2">
            <Keyboard className="size-4 text-primary" aria-hidden="true" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription id={DESCRIPTION_ID}>
            Power-user shortcuts. They are ignored while you are typing, and each
            one can be turned off in Settings.
          </DialogDescription>
        </DialogHeader>

        <ul className="mt-4 space-y-3">
          {shortcuts.map((shortcut) => (
            <li key={shortcut.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">{shortcut.label}</p>
                <p className="text-xs text-muted-foreground">{shortcut.description}</p>
              </div>
              <KeyboardKeys keys={shortcut.keys} />
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Tutorial: press <KeyboardKeys keys="?" /> anywhere outside a text field to
          reopen this list, then head to Settings to switch a shortcut off.
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Mounts the global shortcut listener and the help dialog, and shares the
 * per-shortcut preferences with Settings. Rendered once in the root layout, so
 * the shortcuts work on every page.
 */
export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [preferences, setPreferences] = useState<ShortcutPreferences>({})
  const [isHelpOpen, setHelpOpen] = useState(false)

  // Read the stored preferences after mount so the server markup matches.
  useEffect(() => {
    setPreferences(readPreferences())
  }, [])

  const isEnabled = useCallback((id: string) => preferences[id] !== false, [preferences])

  const setEnabled = useCallback((id: string, enabled: boolean) => {
    setPreferences((previous) => {
      const next = { ...previous, [id]: enabled }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Preference is best-effort: keep the in-memory state either way.
      }
      return next
    })
  }, [])

  const openHelp = useCallback(() => setHelpOpen(true), [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])

  const handlers = useMemo(
    () => ({
      help: () => setHelpOpen((open) => !open),
      send: () => {
        // On the send page the submit control is marked; elsewhere the
        // shortcut opens the send form.
        const submit = document.querySelector<HTMLElement>('[data-shortcut="send"]')
        if (submit) {
          submit.click()
          return
        }
        router.push('/send')
      },
      search: () => {
        document.querySelector<HTMLElement>('[data-shortcut="search"]')?.focus()
      },
      close: () => setHelpOpen(false),
    }),
    [router],
  )

  useKeyboardShortcuts(handlers, { enabled: preferences })

  const value = useMemo(
    () => ({ shortcuts: KEYBOARD_SHORTCUTS, isEnabled, setEnabled, openHelp, closeHelp, isHelpOpen }),
    [isEnabled, setEnabled, openHelp, closeHelp, isHelpOpen],
  )

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
      <KeyboardShortcutsHelpDialog
        open={isHelpOpen}
        onOpenChange={setHelpOpen}
        shortcuts={KEYBOARD_SHORTCUTS}
      />
    </KeyboardShortcutsContext.Provider>
  )
}
