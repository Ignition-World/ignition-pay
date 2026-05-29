import { default as React } from 'react';

export interface AddressInputProps {
    onResult?: (result: any) => void;
    placeholder?: string;
    className?: string;
}
export declare const AddressInput: React.FC<AddressInputProps>;
export default AddressInput;
