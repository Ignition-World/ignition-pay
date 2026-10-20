export interface TransactionRecord {
    id: string;
    hash: string;
    sender: string;
    recipient: string;
    amount: number;
}
export declare function searchTransactions(records: TransactionRecord[], query: string): TransactionRecord[];
