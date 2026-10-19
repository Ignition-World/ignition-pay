import React from 'react';

export type TransactionStatusType = 'SUCCESS' | 'PENDING' | 'FAILED';

export interface TransactionStatusBadgeProps {
  status: TransactionStatusType;
}

export const TransactionStatusBadge: React.FC<TransactionStatusBadgeProps> = ({ status }) => {
  const badgeStyles: Record<TransactionStatusType, string> = {
    SUCCESS: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300',
    PENDING: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-300',
    FAILED: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 border-rose-300',
  };

  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeStyles[status]}`}>
      {status}
    </span>
  );
};

export default TransactionStatusBadge;
