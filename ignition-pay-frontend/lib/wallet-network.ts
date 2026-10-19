/**
 * Wallet network changes.
 *
 * A connected wallet can switch network (e.g. testnet <-> public) from its own
 * UI at any time, including while this tab is in the background. Whatever
 * integrates with the wallet reports that by calling
 * {@link notifyWalletNetworkChanged}; the app shell and the balance hooks
 * subscribe here, so they all react to the same event and never keep showing
 * balances from the previous network.
 */

export const WALLET_NETWORK_CHANGED_EVENT = 'ignition-pay:wallet-network-changed'

export interface WalletNetworkChange {
  /** Human-readable network name, e.g. `PUBLIC` or `TESTNET`. */
  network: string
}

export function notifyWalletNetworkChanged(network: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<WalletNetworkChange>(WALLET_NETWORK_CHANGED_EVENT, { detail: { network } }),
  )
}

/** Subscribes to network changes. Returns an unsubscribe function. */
export function subscribeToWalletNetworkChanges(
  listener: (change: WalletNetworkChange) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<WalletNetworkChange>).detail
    listener({ network: typeof detail?.network === 'string' && detail.network ? detail.network : 'unknown' })
  }
  window.addEventListener(WALLET_NETWORK_CHANGED_EVENT, handler)
  return () => window.removeEventListener(WALLET_NETWORK_CHANGED_EVENT, handler)
}
