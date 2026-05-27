export type AddressType = "G" | "M" | "C" | "invalid";

export interface AddressValidationResult {
  address: string;
  type: AddressType;
  muxedId?: string;
  warnings?: string[];
  isValid: boolean;
}
