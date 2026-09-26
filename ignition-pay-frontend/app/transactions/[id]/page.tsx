"use client"

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ExternalLink, ArrowLeft } from 'lucide-react'

type TxDetail = {
  id: string
  memo?: string | null
  fee?: number | null
  ledger?: number | null
  txHash?: string | null
  timestamp?: string
  amount?: number
  asset?: string
  recipient?: string
}

export default function TransactionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string | undefined
  const [tx, setTx] = useState<TxDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    const url = `${window.location.origin}/sep24/transactions/${id}`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch')
        return r.json()
      })
      .then((data) => setTx(data))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-6">Transaction id missing</div>
  if (loading) return <div className="p-6">Loading…</div>
  if (error) return <div className="p-6 text-destructive">Error: {error}</div>
  if (!tx) return <div className="p-6 text-muted-foreground">No data</div>

  const explorer = tx.txHash ? `https://stellar.expert/explorer/public/tx/${tx.txHash}` : null

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <h1 className="text-2xl font-bold">Transaction Details</h1>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div>
          <div className="text-sm text-muted-foreground">ID</div>
          <div className="font-mono text-sm break-all">{tx.id}</div>
        </div>

        {tx.memo && (
          <div>
            <div className="text-sm text-muted-foreground">Memo</div>
            <div className="text-sm">{tx.memo}</div>
          </div>
        )}

        {typeof tx.fee !== 'undefined' && tx.fee !== null && (
          <div>
            <div className="text-sm text-muted-foreground">Network Fee</div>
            <div className="text-sm">{tx.fee} XLM</div>
          </div>
        )}

        {tx.ledger && (
          <div>
            <div className="text-sm text-muted-foreground">Ledger</div>
            <div className="text-sm">{tx.ledger}</div>
          </div>
        )}

        {tx.txHash && (
          <div>
            <div className="text-sm text-muted-foreground">Transaction Hash</div>
            <div className="flex items-center gap-2">
              <div className="font-mono text-sm break-all">{tx.txHash}</div>
              <a href={explorer ?? '#'} target="_blank" rel="noopener noreferrer" className="text-primary">
                <ExternalLink />
              </a>
            </div>
          </div>
        )}

        {tx.timestamp && (
          <div>
            <div className="text-sm text-muted-foreground">Time</div>
            <div className="text-sm">{new Date(tx.timestamp).toLocaleString()}</div>
          </div>
        )}

        {(tx.amount || tx.recipient) && (
          <div>
            <div className="text-sm text-muted-foreground">Details</div>
            <div className="text-sm">
              {tx.amount ? `${tx.amount} ${tx.asset ?? ''}` : null}
              {tx.recipient ? ` — to ${tx.recipient}` : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
