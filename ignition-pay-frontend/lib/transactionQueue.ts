const DB_NAME = 'IgnitionPayQueue'
const DB_VERSION = 1
const STORE_NAME = 'transactions'

export interface QueuedTransaction {
  id: string
  recipientAddress: string
  amount: string
  assetCode: string
  senderWalletId: string
  timestamp: number
  retries: number
  status: 'pending' | 'failed' | 'sent'
  lastError?: string
}

class TransactionQueueDB {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('status', 'status', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }
    })
  }

  async addTransaction(queued: QueuedTransaction): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.add(queued)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getTransaction(id: string): Promise<QueuedTransaction | undefined> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(id)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async getAllTransactions(): Promise<QueuedTransaction[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async getPendingTransactions(): Promise<QueuedTransaction[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('status')
      const request = index.getAll('pending')

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async updateTransaction(queued: QueuedTransaction): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(queued)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async deleteTransaction(id: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async clearQueue(): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

const queueDB = new TransactionQueueDB()

export async function queueTransaction(transaction: Omit<QueuedTransaction, 'id' | 'timestamp' | 'retries' | 'status'>): Promise<string> {
  const id = crypto.randomUUID()
  const queuedTx: QueuedTransaction = {
    ...transaction,
    id,
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
  }
  await queueDB.addTransaction(queuedTx)
  return id
}

export async function getQueuedTransactions(): Promise<QueuedTransaction[]> {
  return queueDB.getAllTransactions()
}

export async function getPendingTransactions(): Promise<QueuedTransaction[]> {
  return queueDB.getPendingTransactions()
}

export async function updateQueuedTransaction(transaction: QueuedTransaction): Promise<void> {
  await queueDB.updateTransaction(transaction)
  notifyQueueChanged()
}

/** Tell listeners (queue list, nav badge) that the stored queue changed. */
export const QUEUE_CHANGED_EVENT = 'transactionQueueChanged'

function notifyQueueChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT))
}

/**
 * Put a failed transaction back in the queue with a fresh retry budget and ask
 * the processor to run again. No-op if the entry no longer exists.
 */
export async function retryQueuedTransaction(id: string): Promise<void> {
  const existing = await queueDB.getTransaction(id)
  if (!existing) return
  await queueDB.updateTransaction({ ...existing, status: 'pending', retries: 0, lastError: undefined })
  notifyQueueChanged()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('processTransactionQueue'))
}

export async function removeQueuedTransaction(id: string): Promise<void> {
  await queueDB.deleteTransaction(id)
  notifyQueueChanged()
}

export async function clearTransactionQueue(): Promise<void> {
  await queueDB.clearQueue()
}
