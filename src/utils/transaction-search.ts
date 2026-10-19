export interface TransactionRecord {
  id: string;
  hash: string;
  sender: string;
  recipient: string;
  amount: number;
}

export function searchTransactions(records: TransactionRecord[], query: string): TransactionRecord[] {
  if (!query || query.trim() === '') {
    return records;
  }
  const q = query.toLowerCase().trim();
  return records.filter(tx =>
    tx.hash.toLowerCase().includes(q) ||
    tx.sender.toLowerCase().includes(q) ||
    tx.recipient.toLowerCase().includes(q)
  );
}
