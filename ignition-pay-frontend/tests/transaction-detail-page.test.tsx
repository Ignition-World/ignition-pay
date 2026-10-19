import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode, ErrorMessage } from '../lib/constants/errors';
import TransactionDetailPage from '../app/transactions/[id]/page';

/**
 * End-to-end check for the wiring added in issue #896: the transaction detail
 * page used to render `Error: ${String(caught)}` — raw technical text with a
 * fixed prefix. It now hands the thrown value to `toUserMessage`, so the status
 * the server answered with decides what the user reads.
 *
 * `tests/error-messages.test.ts` covers the mapping itself; this covers the page
 * that consumes it.
 */
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'tx-1' }),
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
}));

/** jsdom has no `Response`, so the page only needs the shape it actually reads. */
function respondWith(status: number): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  } as unknown as Response);
}

describe('TransactionDetailPage error reporting', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => respondWith(500)),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('reports a rate limit as a rate limit', async () => {
    vi.mocked(fetch).mockImplementation(() => respondWith(429));

    render(<TransactionDetailPage />);

    await waitFor(() =>
      expect(
        screen.getByText(ErrorMessage[ErrorCode.RATE_LIMIT_EXCEEDED]),
      ).toBeInTheDocument(),
    );
  });

  it('reports an expired session as an expired session', async () => {
    vi.mocked(fetch).mockImplementation(() => respondWith(401));

    render(<TransactionDetailPage />);

    await waitFor(() =>
      expect(
        screen.getByText(ErrorMessage[ErrorCode.AUTH_UNAUTHORIZED]),
      ).toBeInTheDocument(),
    );
  });

  it('reports a dropped connection as a network problem', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    render(<TransactionDetailPage />);

    await waitFor(() =>
      expect(
        screen.getByText(ErrorMessage[ErrorCode.GEN_NETWORK_ERROR]),
      ).toBeInTheDocument(),
    );
  });

  it('never shows the raw "Error: …" prefix', async () => {
    vi.mocked(fetch).mockImplementation(() => respondWith(500));

    render(<TransactionDetailPage />);

    await waitFor(() =>
      expect(
        screen.getByText(ErrorMessage[ErrorCode.GEN_INTERNAL_ERROR]),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
  });
});
