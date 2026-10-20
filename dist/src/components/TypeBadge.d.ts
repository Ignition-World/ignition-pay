import React from 'react';
export type AddressType = 'G' | 'M' | 'C' | 'UNKNOWN';
interface TypeBadgeProps {
    type: AddressType;
}
export declare const TypeBadge: React.FC<TypeBadgeProps>;
export {};
