import React, { useState, useMemo } from 'react';
import { TypeBadge, AddressType } from './components/TypeBadge';
import { WarningList } from './components/WarningList';
import { MemoField } from './components/MemoField';

export const AddressInput: React.FC = () => {
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');

  const type = useMemo<AddressType>(() => {
    if (!address) return 'UNKNOWN';
    const firstChar = address.charAt(0).toUpperCase();
    if (firstChar === 'M') return 'M';
    if (firstChar === 'G') return 'G';
    if (firstChar === 'C') return 'C';
    return 'UNKNOWN';
  }, [address]);

  const showMemo = type === 'G' || type === 'UNKNOWN';
  
  const warnings = useMemo(() => {
    const list: string[] = [];
    if (type === 'C') {
      list.push('Contract addresses cannot be used for standard payments.');
    }
    return list;
  }, [type]);

  return (
    <div style={{ maxWidth: '32rem', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {type !== 'UNKNOWN' && (
          <div style={{ position: 'absolute', left: '0.5rem' }}>
            <TypeBadge type={type} />
          </div>
        )}
        <input
          type="text"
          placeholder="Paste Stellar address (G..., M..., C...)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={{
            width: '100%',
            padding: `0.75rem 0.75rem 0.75rem ${type !== 'UNKNOWN' ? '3rem' : '0.75rem'}`,
            border: '1px solid #cbd5e1',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            boxSizing: 'border-box',
            outline: 'none',
            transition: 'padding 0.2s ease'
          }}
        />
      </div>

      <MemoField isVisible={showMemo && !!address} value={memo} onChange={setMemo} />
      
      <WarningList warnings={warnings} />
    </div>
  );
};
