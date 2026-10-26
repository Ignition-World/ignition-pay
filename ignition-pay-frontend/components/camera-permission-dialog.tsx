'use client'

// Issue #859: accessible camera-permission gate shared by QR scanners.
// Built on the shared Dialog (role="dialog", aria-modal, focus trap, Escape to close),
// with a labelled title/description, a live status region and an auto-focused action.

import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type CameraPermissionState = 'prompt' | 'requesting' | 'granted' | 'denied' | 'unavailable'

interface CameraPermissionDialogProps {
  open: boolean
  state: CameraPermissionState
  onOpenChange: (open: boolean) => void
  /** Called when the user chooses to allow camera access. */
  onRequestAccess: () => void
}

const STATUS_TEXT: Record<CameraPermissionState, string> = {
  prompt: 'Camera access has not been granted yet.',
  requesting: 'Waiting for camera permission…',
  granted: 'Camera access granted.',
  denied:
    'Camera access was denied. Enable the camera for this site in your browser settings, then try again.',
  unavailable: 'No camera was found on this device.',
}

export function CameraPermissionDialog({
  open,
  state,
  onOpenChange,
  onRequestAccess,
}: CameraPermissionDialogProps) {
  const canRequest = state === 'prompt' || state === 'denied'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Allow camera access</DialogTitle>
          <DialogDescription>
            Ignition Pay needs your camera to scan a QR code. Video is processed on your device
            and is never uploaded.
          </DialogDescription>
        </DialogHeader>

        <p
          role="status"
          aria-live="polite"
          className={
            state === 'denied' || state === 'unavailable'
              ? 'mt-4 text-sm text-destructive'
              : 'mt-4 text-sm text-muted-foreground'
          }
        >
          {STATUS_TEXT[state]}
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {canRequest && (
            <Button type="button" autoFocus onClick={onRequestAccess}>
              <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
              {state === 'denied' ? 'Try again' : 'Allow camera'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
