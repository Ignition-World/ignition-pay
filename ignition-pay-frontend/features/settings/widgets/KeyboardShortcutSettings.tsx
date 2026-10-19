'use client'

import { Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  KeyboardKeys,
  useKeyboardShortcutsContext,
} from '@/components/keyboard-shortcuts'

/**
 * Settings section for the power-user keyboard shortcuts (issue #668). Each
 * shortcut can be switched off here; the choice is persisted by the provider in
 * the root layout. The tutorial lives in the help dialog, reachable from `?` or
 * from the button below.
 */
export function KeyboardShortcutSettings() {
  const { shortcuts, isEnabled, setEnabled, openHelp } = useKeyboardShortcutsContext()

  return (
    <div className="bg-card rounded-xl border border-border p-8 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center">
          <Keyboard size={20} className="text-sky-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Keyboard shortcuts</h2>
          <p className="text-sm text-muted-foreground">
            Speed up common actions. Shortcuts never fire while you are typing.
          </p>
        </div>
      </div>

      <ul className="space-y-4">
        {shortcuts.map((shortcut) => (
          <li
            key={shortcut.id}
            className="flex items-center justify-between gap-4 py-4 border-b border-border last:border-b-0"
          >
            <div>
              <p className="font-semibold text-foreground">{shortcut.label}</p>
              <p className="text-sm text-muted-foreground">{shortcut.description}</p>
            </div>

            <div className="flex items-center gap-4">
              <KeyboardKeys keys={shortcut.keys} />
              <label className="relative inline-flex items-center cursor-pointer">
                <span className="sr-only">
                  Enable the {shortcut.label} shortcut
                </span>
                <input
                  type="checkbox"
                  checked={isEnabled(shortcut.id)}
                  onChange={(event) => setEnabled(shortcut.id, event.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all" />
              </label>
            </div>
          </li>
        ))}
      </ul>

      <Button variant="outline" onClick={openHelp}>
        View shortcuts tutorial
      </Button>
    </div>
  )
}
