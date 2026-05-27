import { useState, useEffect } from "react";
import { AddressValidationResult, AddressType } from "../types";
import { detect } from "../../packages/core-ts/src/address/detect";
import StellarSdk from "@stellar/stellar-sdk";

export const useAddressValidation = (address: string): AddressValidationResult => {
  const [result, setResult] = useState<AddressValidationResult>({
    address,
    type: "invalid",
    isValid: false,
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      const type = detect(address) as AddressType;
      let muxedId: string | undefined;
      const warnings: string[] = [];

      if (type === "M") {
        try {
          const muxed = StellarSdk.MuxedAccount.fromAddress(address, "1");
          // Extract ID from the address string itself if possible, 
          // but StellarSdk.MuxedAccount.fromAddress combined with the address string works.
          // For decoding muxed ID specifically:
          const decoded = StellarSdk.StrKey.decodeMed25519PublicKey(address);
          // The ID is in the last 8 bytes of the decoded 43 bytes?
          // Actually StellarSdk provides a better way:
          muxedId = muxed.id();
        } catch (e) {
          console.error("Failed to decode muxed ID", e);
        }
      }

      if (type === "C") {
        warnings.push("Contract addresses should be used with caution for payments.");
      }

      setResult({
        address,
        type,
        muxedId,
        warnings: warnings.length > 0 ? warnings : undefined,
        isValid: type !== "invalid",
      });
    }, 300);

    return () => clearTimeout(handler);
  }, [address]);

  return result;
};
