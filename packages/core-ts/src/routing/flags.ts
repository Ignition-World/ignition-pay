/**
 * Feature flags for routing logic.
 *
 * `experimentalRouting` gates the new multi-chain routing model that resolves
 * addresses via `SourceAddress` / `TargetChains`. When `false` (the default)
 * the stable memo-based routing path is used. When `true` the experimental
 * path is invoked instead.
 *
 * The flag can be set per-call through {@link RoutingInput.flags} so that
 * callers can opt in without affecting the rest of the application.
 */
export type RoutingFlags = {
  /** Enable the experimental multi-chain routing path. Defaults to `false`. */
  experimentalRouting?: boolean;
};

/** Default flag values — stable behaviour is always the default. */
export const DEFAULT_ROUTING_FLAGS: Required<RoutingFlags> = {
  experimentalRouting: false,
};

/**
 * Merges caller-supplied flags with the defaults, returning a fully-resolved
 * flag set. Missing flags fall back to their default values.
 */
export function resolveFlags(flags?: RoutingFlags): Required<RoutingFlags> {
  return { ...DEFAULT_ROUTING_FLAGS, ...flags };
}
