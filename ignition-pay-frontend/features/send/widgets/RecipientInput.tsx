'use client'

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react'
import { Clock, Star, X, AlertCircle, CheckCircle, ClipboardPaste, UserPlus } from 'lucide-react'
import { truncateAddress } from '@/lib/stellar/strkey'
import type { SavedContact, RecentRecipient } from '../state/recipients'

export interface SuggestionItem {
  address: string
  label: string
  kind: 'contact' | 'recent'
  useCount?: number
}

interface RecipientInputProps {
  value: string
  onChange: (address: string) => void
  onBlur?: () => void
  contacts: SavedContact[]
  recents: RecentRecipient[]
  isValid: boolean
  showError: boolean
  errorMessage?: string
  validKindLabel?: string
  onPaste: () => void
  /** Called when the user wants to save the current (valid) address as a contact */
  onSaveContact?: (address: string) => void
}

function buildSuggestions(
  query: string,
  contacts: SavedContact[],
  recents: RecentRecipient[],
): SuggestionItem[] {
  const q = query.trim().toLowerCase()

  const contactItems: SuggestionItem[] = contacts
    .filter(
      (c) =>
        q === '' || c.label.toLowerCase().includes(q) || c.address.toLowerCase().includes(q),
    )
    .map((c) => ({ address: c.address, label: c.label, kind: 'contact' as const }))

  // Only show recents not already in contacts
  const contactAddresses = new Set(contacts.map((c) => c.address))
  const recentItems: SuggestionItem[] = recents
    .filter(
      (r) =>
        !contactAddresses.has(r.address) &&
        (q === '' || r.address.toLowerCase().includes(q)),
    )
    .map((r) => ({
      address: r.address,
      label: truncateAddress(r.address),
      kind: 'recent' as const,
      useCount: r.useCount,
    }))

  return [...contactItems, ...recentItems]
}

export function RecipientInput({
  value,
  onChange,
  onBlur,
  contacts,
  recents,
  isValid,
  showError,
  errorMessage,
  validKindLabel,
  onPaste,
  onSaveContact,
}: RecipientInputProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const suggestions = buildSuggestions(value, contacts, recents)
  const hasSuggestions = suggestions.length > 0

  // Open the dropdown when focused and there are suggestions
  const handleFocus = useCallback(() => {
    if (hasSuggestions) setOpen(true)
  }, [hasSuggestions])

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value.trim())
      setActiveIndex(-1)
      // Show dropdown as soon as there's a match or on empty (show all)
      setOpen(true)
    },
    [onChange],
  )

  const selectSuggestion = useCallback(
    (item: SuggestionItem) => {
      onChange(item.address)
      setOpen(false)
      setActiveIndex(-1)
      inputRef.current?.focus()
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open || !hasSuggestions) {
        if (e.key === 'ArrowDown' && hasSuggestions) {
          setOpen(true)
          setActiveIndex(0)
          e.preventDefault()
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((i: number) => Math.min(i + 1, suggestions.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((i: number) => (i <= 0 ? -1 : i - 1))
          break
        case 'Enter':
          if (activeIndex >= 0 && suggestions[activeIndex]) {
            e.preventDefault()
            selectSuggestion(suggestions[activeIndex])
          }
          break
        case 'Escape':
          setOpen(false)
          setActiveIndex(-1)
          break
        case 'Tab':
          setOpen(false)
          break
      }
    },
    [open, hasSuggestions, suggestions, activeIndex, selectSuggestion],
  )

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const inputClasses = [
    'w-full pl-4 pr-20 py-3 rounded-lg bg-background border text-foreground',
    'placeholder:text-muted-foreground focus:outline-none font-mono text-sm',
    showError
      ? 'border-destructive focus:border-destructive'
      : isValid
        ? 'border-green-500/60 focus:border-green-500'
        : 'border-border focus:border-primary',
  ].join(' ')

  const activeDescendant =
    open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id="recipient-address"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoCapitalize="characters"
          placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          className={inputClasses}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open && hasSuggestions}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-invalid={showError}
          aria-describedby="recipient-feedback"
          required
        />

        {/* Action buttons */}
        <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {/* Save-as-contact button — only shown when address is valid and not already saved */}
          {isValid &&
            onSaveContact &&
            !contacts.some((c) => c.address === value) && (
              <button
                type="button"
                onClick={() => onSaveContact(value)}
                aria-label="Save as contact"
                title="Save as contact"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <UserPlus size={15} />
              </button>
            )}
          <button
            type="button"
            onClick={onPaste}
            aria-label="Paste from clipboard"
            title="Paste from clipboard"
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <ClipboardPaste size={16} />
          </button>
        </span>
      </div>

      {/* Dropdown */}
      {open && hasSuggestions && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg overflow-auto max-h-56 py-1"
        >
          {suggestions.map((item, idx) => (
            <li
              key={item.address}
              id={`${listboxId}-option-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e: MouseEvent) => {
                // Prevent blur before click registers
                e.preventDefault()
                selectSuggestion(item)
              }}
              className={[
                'flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none',
                idx === activeIndex
                  ? 'bg-primary/10 text-foreground'
                  : 'hover:bg-muted/60 text-foreground',
              ].join(' ')}
            >
              <span className="flex-shrink-0 text-muted-foreground">
                {item.kind === 'contact' ? <Star size={14} /> : <Clock size={14} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-sm truncate">{item.label}</span>
                <span className="block font-mono text-xs text-muted-foreground truncate">
                  {truncateAddress(item.address)}
                </span>
              </span>
              {item.kind === 'recent' && item.useCount && item.useCount > 1 && (
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  ×{item.useCount}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Feedback line */}
      <p
        id="recipient-feedback"
        aria-live="polite"
        className={[
          'text-xs mt-2 flex items-center gap-1.5',
          showError
            ? 'text-destructive'
            : isValid
              ? 'text-green-500'
              : 'text-muted-foreground',
        ].join(' ')}
      >
        {showError ? (
          <>
            <AlertCircle size={13} />
            {errorMessage}
          </>
        ) : isValid && validKindLabel ? (
          <>
            <CheckCircle size={13} />
            Valid {validKindLabel} — checksum verified
          </>
        ) : (
          'The Stellar address you want to send funds to'
        )}
      </p>
    </div>
  )
}
