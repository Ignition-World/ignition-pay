import React from 'react';

export interface AddressInputProps {
  onResult?: (result: any) => void;
  placeholder?: string;
  className?: string;
}

export const AddressInput: React.FC<AddressInputProps> = ({
  onResult,
  placeholder = 'Enter Stellar Address...',
  className = '',
}) => {
  return (
    <div className={`relative w-full ${className}`}>
      <input
        type="text"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        placeholder={placeholder}
        onChange={(e) => {
          // Placeholder for future validation logic
          if (onResult) {
            onResult({ value: e.target.value, valid: false });
          }
        }}
      />
    </div>
  );
};

export default AddressInput;
