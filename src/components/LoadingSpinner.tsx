import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  label = 'Loading...',
}) => {
  const sizeMap = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-10 h-10 border-3',
  };

  return (
    <div className="flex items-center gap-2" role="status">
      <div
        className={`rounded-full border-t-indigo-600 border-gray-200 animate-spin ${sizeMap[size]}`}
      />
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
};

export default LoadingSpinner;
