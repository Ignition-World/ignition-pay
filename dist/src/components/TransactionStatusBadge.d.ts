import React from 'react';
export type TransactionStatusType = 'SUCCESS' | 'PENDING' | 'FAILED';
export interface TransactionStatusBadgeProps {
    status: TransactionStatusType;
}
export declare const TransactionStatusBadge: React.FC<TransactionStatusBadgeProps>;
export default TransactionStatusBadge;
