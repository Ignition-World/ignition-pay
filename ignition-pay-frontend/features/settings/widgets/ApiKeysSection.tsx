'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Key,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type {
  ApiKeySummary,
  CreateApiKeyResult,
  RotateApiKeyResult,
} from '../models'
import {
  cancelApiKeyRotation,
  createApiKey,
  finalizeApiKeyRotation,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from '../services/api-keys'

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusBadge(status: ApiKeySummary['status']) {
  switch (status) {
    case 'active':
      return <Badge variant="success">Active</Badge>
    case 'rotating':
      return <Badge variant="warning">Rotating</Badge>
    case 'revoked':
      return <Badge variant="destructive">Revoked</Badge>
  }
}

interface RawKeyDialogProps {
  title: string
  description: string
  rawKey: string | null
  onClose: () => void
}

function RawKeyDialog({ title, description, rawKey, onClose }: RawKeyDialogProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!rawKey) return
    await navigator.clipboard.writeText(rawKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={rawKey !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-background p-4">
          <p className="break-all font-mono text-sm text-foreground">{rawKey}</p>
        </div>

        <DialogFooter>
          <Button onClick={copy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copied!' : 'Copy key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Create flow
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Raw keys shown exactly once after create/rotate
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResult | null>(null)
  const [rotatedKey, setRotatedKey] = useState<RotateApiKeyResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setKeys(await listApiKeys())
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runAction = async (
    id: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setBusyId(id)
    setError(null)
    try {
      await action()
      setNotice(successMessage)
      setTimeout(() => setNotice(null), 4000)
      await load()
    } catch (err) {
      setError((err as Error).message ?? 'Request failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    setCreateError(null)
    try {
      const result = await createApiKey(createName.trim() || undefined)
      setCreateOpen(false)
      setCreateName('')
      setCreatedKey(result)
      await load()
    } catch (err) {
      setCreateError((err as Error).message ?? 'Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const handleRotate = (key: ApiKeySummary) =>
    runAction(
      key.id,
      async () => {
        const result = await rotateApiKey(key.id)
        setRotatedKey(result)
      },
      'Rotation started — the old key stays valid for 7 days.',
    )

  const handleFinalize = (key: ApiKeySummary) => {
    if (
      !window.confirm(
        'Finalize rotation? The old key will be revoked immediately and stop working.',
      )
    ) {
      return
    }
    void runAction(
      key.id,
      () => finalizeApiKeyRotation(key.id),
      'Rotation finalized — the old key has been revoked.',
    )
  }

  const handleCancel = (key: ApiKeySummary) => {
    if (
      !window.confirm(
        'Cancel rotation? The new key will be revoked and the old key stays active.',
      )
    ) {
      return
    }
    void runAction(
      key.id,
      () => cancelApiKeyRotation(key.id),
      'Rotation cancelled — the old key remains active.',
    )
  }

  const handleRevoke = (key: ApiKeySummary) => {
    if (
      !window.confirm(
        `Revoke "${key.name}"? It will stop working immediately and cannot be recovered.`,
      )
    ) {
      return
    }
    void runAction(
      key.id,
      () => revokeApiKey(key.id),
      'API key revoked.',
    )
  }

  return (
    <div className="bg-card rounded-xl border border-border p-8 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <Key size={20} className="text-cyan-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">API Keys</h2>
            <p className="text-sm text-muted-foreground">
              Keys are hashed and can be rotated without downtime
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh API keys"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCreateError(null)
              setCreateOpen(true)
            }}
          >
            <Plus size={16} className="mr-2" />
            Create Key
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-600 dark:text-green-400">
          {notice}
        </div>
      )}

      <div className="space-y-4">
        {keys.length === 0 && !loading && !error && (
          <div className="py-8 text-center">
            <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No API keys yet. Create one to start integrating.
            </p>
          </div>
        )}

        {keys.map((key) => (
          <div
            key={key.id}
            className="flex flex-wrap items-center justify-between gap-3 py-4 border-b border-border last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-foreground truncate">
                  {key.name}
                </p>
                {statusBadge(key.status)}
              </div>
              <p className="text-sm font-mono text-muted-foreground truncate">
                {key.prefix}...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Created {formatDate(key.createdAt)} &middot; Last used{' '}
                {formatDate(key.lastUsedAt)}
                {key.status === 'rotating' && key.rotationExpiresAt && (
                  <>
                    {' '}
                    &middot; Old key valid until{' '}
                    {formatDate(key.rotationExpiresAt)}
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {key.status === 'rotating' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === key.id}
                    onClick={() => handleFinalize(key)}
                  >
                    Finalize
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === key.id}
                    onClick={() => handleCancel(key)}
                  >
                    Cancel
                  </Button>
                </>
              )}
              {key.status === 'active' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === key.id}
                  onClick={() => void handleRotate(key)}
                >
                  <RefreshCw size={14} className="mr-1.5" />
                  Rotate
                </Button>
              )}
              {key.status !== 'revoked' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                  disabled={busyId === key.id}
                  onClick={() => handleRevoke(key)}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create key dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Give your key a name so you can recognize it later.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="e.g. Production Key"
            maxLength={100}
            aria-label="API key name"
          />

          {createError && (
            <p className="text-sm text-red-500">{createError}</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? 'Creating…' : 'Create key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time key reveal after creation */}
      <RawKeyDialog
        title="Your new API key"
        description="Store it somewhere safe — for security, it will not be shown again."
        rawKey={createdKey?.key ?? null}
        onClose={() => setCreatedKey(null)}
      />

      {/* One-time key reveal after rotation */}
      <RawKeyDialog
        title="Your new API key"
        description="Store it somewhere safe — for security, it will not be shown again. The old key stays valid for 7 days."
        rawKey={rotatedKey?.key ?? null}
        onClose={() => setRotatedKey(null)}
      />
    </div>
  )
}
