"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchTransactions = searchTransactions;
function searchTransactions(records, query) {
    if (!query || query.trim() === '') {
        return records;
    }
    const q = query.toLowerCase().trim();
    return records.filter(tx => tx.hash.toLowerCase().includes(q) ||
        tx.sender.toLowerCase().includes(q) ||
        tx.recipient.toLowerCase().includes(q));
}
