'use client'

import { useState, useCallback, useEffect } from 'react'
import { truncateAddress } from '@/lib/stellar/strkey'

export interface SavedContact {
  /** User-defined label, e.g. "Alice" */
  label: string
  address: string
  /** ISO timestamp of when the contact was saved */
  savedAt: string
}

export interface RecentRecipient {
  address: string
  /** ISO timestamp of the most recent send to this address */
  lastUsedAt: string
  /** Number of times sent to this address */
  useCount: number
}

const CONTACTS_KEY = 'ignition_pay_contacts'
const RECENTS_KEY = 'ignition_pay_recent_recipients'
const MAX_RECENTS = 10

// ─── Contacts ────────────────────────────────────────────────────────────────

let globalContacts: SavedContact[] = []
let contactListeners = new Set<() => void>()

function readContacts(): SavedContact[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CONTACTS_KEY)
    return raw ? (JSON.parse(raw) as SavedContact[]) : []
  } catch {
    return []
  }
}

function writeContacts(contacts: SavedContact[]) {
  globalContacts = contacts
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts))
    } catch {
      /* private browsing / storage full — ignore */
    }
  }
  contactListeners.forEach((fn) => fn())
}

if (typeof window !== 'undefined') {
  globalContacts = readContacts()
}

// ─── Recent Recipients ────────────────────────────────────────────────────────

let globalRecents: RecentRecipient[] = []
let recentListeners = new Set<() => void>()

function readRecents(): RecentRecipient[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)
    return raw ? (JSON.parse(raw) as RecentRecipient[]) : []
  } catch {
    return []
  }
}

function writeRecents(recents: RecentRecipient[]) {
  globalRecents = recents
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(recents))
    } catch {
      /* ignore */
    }
  }
  recentListeners.forEach((fn) => fn())
}

if (typeof window !== 'undefined') {
  globalRecents = readRecents()
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Returns the display label for an address — contact name if known, else truncated address. */
export function getLabelForAddress(address: string, contacts: SavedContact[]): string {
  const contact = contacts.find((c) => c.address === address)
  return contact ? contact.label : truncateAddress(address)
}

export function useContacts() {
  const [contacts, setContacts] = useState<SavedContact[]>(globalContacts)

  useEffect(() => {
    setContacts(globalContacts)
    const listener = () => setContacts([...globalContacts])
    contactListeners.add(listener)
    return () => {
      contactListeners.delete(listener)
    }
  }, [])

  const saveContact = useCallback((label: string, address: string) => {
    const trimmedLabel = label.trim()
    const trimmedAddress = address.trim()
    if (!trimmedLabel || !trimmedAddress) return

    const existing = globalContacts.findIndex((c) => c.address === trimmedAddress)
    if (existing >= 0) {
      // Update label if address already saved
      const updated = [...globalContacts]
      updated[existing] = { ...updated[existing], label: trimmedLabel }
      writeContacts(updated)
    } else {
      writeContacts([
        { label: trimmedLabel, address: trimmedAddress, savedAt: new Date().toISOString() },
        ...globalContacts,
      ])
    }
  }, [])

  const removeContact = useCallback((address: string) => {
    writeContacts(globalContacts.filter((c) => c.address !== address))
  }, [])

  return { contacts, saveContact, removeContact }
}

export function useRecentRecipients() {
  const [recents, setRecents] = useState<RecentRecipient[]>(globalRecents)

  useEffect(() => {
    setRecents(globalRecents)
    const listener = () => setRecents([...globalRecents])
    recentListeners.add(listener)
    return () => {
      recentListeners.delete(listener)
    }
  }, [])

  /** Call after a successful payment to persist the recipient. */
  const recordRecipient = useCallback((address: string) => {
    const now = new Date().toISOString()
    const existing = globalRecents.find((r) => r.address === address)
    let updated: RecentRecipient[]
    if (existing) {
      updated = globalRecents.map((r) =>
        r.address === address ? { ...r, lastUsedAt: now, useCount: r.useCount + 1 } : r,
      )
      // Bubble the updated entry to the top
      const idx = updated.findIndex((r) => r.address === address)
      updated = [updated[idx], ...updated.filter((_, i) => i !== idx)]
    } else {
      updated = [{ address, lastUsedAt: now, useCount: 1 }, ...globalRecents]
    }
    writeRecents(updated.slice(0, MAX_RECENTS))
  }, [])

  const clearRecents = useCallback(() => {
    writeRecents([])
  }, [])

  return { recents, recordRecipient, clearRecents }
}
