/**
 * Analytics utilities for the send flow.
 *
 * The send flow validates the destination address asynchronously. To avoid
 * emitting a successful "amount_entered" event before validation completes,
 * callers must await the validation result and only then track the event.
 */

export type AnalyticsEvent =
  | 'amount_entered'
  | 'address_validation_failed'
  | 'send_submitted'
  | 'send_failed';

export interface AnalyticsPayload {
  event: AnalyticsEvent;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

export interface AddressValidationResult {
  valid: boolean;
  reason?: string;
}

export type AddressValidator = (
  address: string,
  chainId?: string | number,
) => Promise<AddressValidationResult>;

export interface SendAmountSubmittedInput {
  amount: string;
  address: string;
  chainId?: string | number;
  currency?: string;
  validateAddress: AddressValidator;
}

export interface SendAmountSubmittedResult {
  eventEmitted: boolean;
  validation: AddressValidationResult;
}

const debugEnabled = process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === 'true';

function safeSerialize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function trackEvent(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {},
): void {
  const payload: AnalyticsPayload = {
    event,
    properties: safeSerialize(properties) as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };

  if (debugEnabled) {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', payload);
  }

  if (typeof window !== 'undefined') {
    const win = window as typeof window & {
      dataLayer?: Array<Record<string, unknown>>;
      gta?: (...args: unknown[]) => void;
    };

    if (Array.isArray(win.dataLayer)) {
      win.dataLayer.push(payload as unknown as Record<string, unknown>);
    }

    if (typeof win.gta === 'function') {
      win.gta('event', event, payload.properties);
    }
  }
}

/**
 * Validates the destination address and only emits the "amount_entered"
 * event once validation has completed successfully. If validation fails, a
 * "address_validation_failed" event is emitted instead.
 */
export async function trackSendAmountSubmitted(
  input: SendAmountSubmittedInput,
): Promise<SendAmountSubmittedResult> {
  const { amount, address, chainId, currency, validateAddress } = input;

  let validation: AddressValidationResult;
  try {
    validation = await validateAddress(address, chainId);
  } catch (error) {
    validation = {
      valid: false,
      reason: error instanceof Error ? error.message : 'validation_error',
    };
  }

  if (!validation.valid) {
    trackEvent('address_validation_failed', {
      amount,
      chainId,
      currency,
      reason: validation.reason ?? 'invalid_address',
    });
    return { eventEmitted: false, validation };
  }

  trackEvent('amount_entered', {
    amount,
    chainId,
    currency,
    // Never send the raw address; only a short fingerprint for correlation.
    addressFingerprint: fingerprintAddress(address),
  });

  return { eventEmitted: true, validation };
}

export function fingerprintAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length < 10) {
    return 'too-short';
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-6)}`;
}
