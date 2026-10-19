'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { truncateAddress } from '@/lib/stellar/strkey'

interface SaveContactDialogProps {
  open: boolean
  address: string
  onClose: () => void
  onSave: (label: string, address: string) => void
}

export function SaveContactDialog({ open, address, onClose, onSave }: SaveContactDialogProps) {
  const [label, setLabel] = useState('')

  // Reset label each time the dialog opens
  useEffect(() => {
    if (open) setLabel('')
  }, [open])

  const handleSave = () => {
    const trimmed = label.trim()
    if (!trimmed) return
    onSave(trimmed, address)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Contact</DialogTitle>
          <DialogDescription>
            Give a name to{' '}
            <span className="font-mono text-xs text-foreground">{truncateAddress(address)}</span> so
            you can find it quickly next time.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <label htmlFor="contact-label" className="block text-sm font-semibold text-foreground mb-2">
            Contact name
          </label>
          <input
            id="contact-label"
            type="text"
            autoFocus
            placeholder="e.g. Alice"
            className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
            maxLength={40}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            className="bg-primary hover:bg-primary/90"
            onClick={handleSave}
            disabled={!label.trim()}
          >
            Save Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
