export declare class Wallet {
    id: string;
    userId: string;
    assetCode: string;
    /**
     * Ledger balance in stroops. Stored as a `bigint` column so amounts stay
     * exact; TypeORM surfaces `bigint` columns as strings, so every read is
     * converted with `BigInt(...)` before arithmetic. The balance value itself
     * doubles as the optimistic-concurrency token used by the compare-and-swap
     * update in `WalletsService.applyBalanceDelta` (issue #587).
     */
    balance: string;
    createdAt: Date;
    updatedAt: Date;
}
