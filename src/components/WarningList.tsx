import React from 'react';

interface WarningListProps {
  warnings: string[];
}

export const WarningList: React.FC<WarningListProps> = ({ warnings }) => {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div
      style={{
        marginTop: '0.5rem',
        padding: '0.75rem',
        backgroundColor: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: '0.375rem',
        color: '#92400e',
        fontSize: '0.875rem'
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
        ⚠️ Warnings:
      </div>
      <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {warnings.map((warning, idx) => (
          <li key={idx} style={{ marginBottom: '0.25rem' }}>
            {warning}
          </li>
        ))}
      </ul>
    </div>
  );
};
