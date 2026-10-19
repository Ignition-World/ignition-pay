import { describe, it, expect } from 'vitest'
import {
  generateOptimisticId,
  isOptimisticTransaction,
  type Transaction,
  type OptimisticTransaction,
} from '../index'

describe('Optimistic Transaction Models', () => {
  describe('generateOptimisticId', () => {
    it('generates unique IDs on each call', () => {
      const id1 = generateOptimisticId()
      const id2 = generateOptimisticId()
      expect(id1).not.toBe(id2)
    })

    it('prefixes ID with "optimistic-"', () => {
      const id = generateOptimisticId()
      expect(id).toMatch(/^optimistic-/)
    })

    it('includes timestamp in ID format', () => {
      const id = generateOptimisticId()
      expect(id).toMatch(/^optimistic-\d+-[a-z0-9]+$/)
    })

    it('generates different IDs in rapid succession', () => {
      const ids = Array.from({ length: 10 }, () => generateOptimisticId())
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(10)
    })
  })

  describe('isOptimisticTransaction', () => {
    it('returns true for optimistic transactions', () => {
      const optimistic: OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        status: 'pending',
        submittedAt: Date.now(),
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        isOptimistic: true,
      }
      expect(isOptimisticTransaction(optimistic)).toBe(true)
    })

    it('returns false for real transactions', () => {
      const real: Transaction = {
        id: 'real-uuid-1234',
        type: 'received',
        asset: 'USDC',
        amount: 500,
        recipient: 'GABC...',
        timestamp: new Date(),
        status: 'confirmed',
      }
      expect(isOptimisticTransaction(real)).toBe(false)
    })

    it('acts as type guard for TypeScript', () => {
      const tx: Transaction | OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        status: 'pending',
        submittedAt: Date.now(),
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        isOptimistic: true,
      }

      if (isOptimisticTransaction(tx)) {
        expect(tx.optimisticId).toBeDefined()
        expect(tx.submittedAt).toBeDefined()
      }
    })
  })
})
