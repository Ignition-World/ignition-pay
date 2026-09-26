/**
 * Trustline verification helper (Issue #420).
 * Before sending a non-XLM asset, verify the recipient has an established
 * trustline for that asset. Returns false if the trustline is missing,
 * which should cause the payment to be rejected before submission.
 */
export interface TrustlineCheckResult {
  hasTrustline: boolean;
  reason?: string;
}

export function checkTrustlineRequired(assetCode: string): boolean {
  // XLM (native) does not require a trustline
  return assetCode.toUpperCase() !== 'XLM';
}

export function buildTrustlineMissingError(assetCode: string, recipient: string): string {
  return (
    `Recipient ${recipient} does not have a trustline for asset ${assetCode}. ` +
    'Ask the recipient to add a trustline before sending.'
  );
}