import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcutsContext,
} from '../components/keyboard-shortcuts'
import { KeyboardShortcutSettings } from '../features/settings/widgets/KeyboardShortcutSettings'
import {
  isEditableElement,
  matchesShortcut,
  parseShortcut,
} from '../hooks/use-keyboard-shortcuts'

const nav = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: nav.push,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}))

beforeEach(() => {
  window.localStorage.clear()
  nav.push.mockReset()
})

afterEach(cleanup)

function AppShell({ children }: { children?: React.ReactNode }) {
  return (
    <KeyboardShortcutsProvider>
      {children ?? (
        <>
          <input aria-label="Memo" />
          <input data-shortcut="search" aria-label="Search transactions" />
          <button type="button" data-shortcut="send">
            Review Payment
          </button>
        </>
      )}
    </KeyboardShortcutsProvider>
  )
}

describe('shortcut matching (#668)', () => {
  it('parses a binding into modifiers and a key', () => {
    expect(parseShortcut('Ctrl + S')).toMatchObject({ key: 'S', ctrl: true, shift: false })
    expect(parseShortcut('?')).toMatchObject({ key: '?', ctrl: false })
  })

  it('treats Cmd as Ctrl so one table fits every OS', () => {
    const event = new KeyboardEvent('keydown', { key: 's', metaKey: true })
    expect(matchesShortcut(event, 'Ctrl + S')).toBe(true)
  })

  it('does not require Shift for symbols that carry it on some layouts', () => {
    const event = new KeyboardEvent('keydown', { key: '?', shiftKey: true })
    expect(matchesShortcut(event, '?')).toBe(true)
  })

  it('recognises editable targets', () => {
    expect(isEditableElement(document.createElement('input'))).toBe(true)
    expect(isEditableElement(document.createElement('div'))).toBe(false)
  })
})

describe('keyboard shortcuts (#668)', () => {
  it('opens the help dialog with ? and lists keys in keyboard format', async () => {
    render(<AppShell />)

    fireEvent.keyDown(window, { key: '?' })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const keys = Array.from(document.querySelectorAll('kbd')).map((node) => node.textContent)
    expect(keys).toContain('Ctrl')
    expect(keys).toContain('S')
    expect(screen.getByText(/Tutorial:/i)).toBeInTheDocument()
  })

  it('ignores shortcuts while a text field is focused', () => {
    render(<AppShell />)

    const memo = screen.getByLabelText('Memo')
    memo.focus()
    fireEvent.keyDown(memo, { key: '?' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('activates the send control on Ctrl + S when one is on the page', () => {
    const onClick = vi.fn()
    render(
      <AppShell>
        <button type="button" data-shortcut="send" onClick={onClick}>
          Review Payment
        </button>
      </AppShell>,
    )

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('navigates to the send page when there is no send control', () => {
    render(
      <AppShell>
        <span>somewhere else</span>
      </AppShell>,
    )

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })

    expect(nav.push).toHaveBeenCalledWith('/send')
  })

  it('focuses the search field on /', () => {
    render(<AppShell />)

    const search = screen.getByLabelText('Search transactions')
    fireEvent.keyDown(window, { key: '/' })

    expect(search).toHaveFocus()
  })

  it('closes the help dialog on Escape', async () => {
    render(<AppShell />)

    fireEvent.keyDown(window, { key: '?' })
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('configuring shortcuts (#668)', () => {
  function DisableHelp() {
    const { setEnabled } = useKeyboardShortcutsContext()
    return (
      <button type="button" onClick={() => setEnabled('help', false)}>
        disable help
      </button>
    )
  }

  it('stops firing a shortcut once it is switched off, and persists the choice', () => {
    render(
      <AppShell>
        <DisableHelp />
      </AppShell>,
    )

    fireEvent.click(screen.getByText('disable help'))
    fireEvent.keyDown(window, { key: '?' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('ignition-pay:keyboard-shortcuts')).toContain(
      '"help":false',
    )
  })

  it('renders a toggle for every shortcut in the settings section', () => {
    render(
      <AppShell>
        <KeyboardShortcutSettings />
      </AppShell>,
    )

    const toggles = screen.getAllByRole('checkbox')
    expect(toggles.length).toBeGreaterThanOrEqual(4)

    fireEvent.click(toggles[0])
    expect(window.localStorage.getItem('ignition-pay:keyboard-shortcuts')).toContain(
      '"help":false',
    )
  })
})
