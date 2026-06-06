import React from 'react';

interface MemoFieldProps {
  isVisible: boolean;
  value: string;
  onChange: (value: string) => void;
}

export const MemoField: React.FC<MemoFieldProps> = ({ isVisible, value, onChange }) => {
  if (!isVisible) return null;

  return (
    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column' }}>
      <label 
        htmlFor="memo-input" 
        style={{ fontSize: '0.875rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }}
      >
        Memo (Optional)
      </label>
      <input
        id="memo-input"
        type="text"
        placeholder="Enter memo here"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          border: '1px solid #cbd5e1',
          borderRadius: '0.375rem',
          fontSize: '1rem',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
        A memo is sometimes required by exchanges.
      </div>
    </div>
  );
};
