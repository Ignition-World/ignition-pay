import React from 'react';
interface MemoFieldProps {
    isVisible: boolean;
    value: string;
    onChange: (value: string) => void;
}
export declare const MemoField: React.FC<MemoFieldProps>;
export {};
