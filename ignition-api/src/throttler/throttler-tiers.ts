import { ExecutionContext } from '@nestjs/common';

/**
 * Per-endpoint rate-limit tiers for the public API.
 *
 *   auth          → /auth/*                          10 req/min (per IP)
 *   public        → unauthenticated requests         60 req/min (per IP)
 *   authenticated → requests carrying a bearer/API key 120 req/min (per user)
 *
 * Exactly one tier applies to each request; the others are skipped.
 * Routes may still add a tighter `@Throttle({ strict | default: ... })`
 * override on top of their tier.
 */
export type ThrottleTier = 'auth' | 'public' | 'authenticated';

export const THROTTLE_TIERS: Record<ThrottleTier, { limit: number; ttl: number }> = {
  auth: { limit: 10, ttl: 60_000 },
  public: { limit: 60, ttl: 60_000 },
  authenticated: { limit: 120, ttl: 60_000 },
};

const AUTH_PREFIX = /^(\/api\/v\d+)?\/auth(\/|$)/;

export function resolveThrottleTier(req: Record<string, any>): ThrottleTier {
  const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
  if (AUTH_PREFIX.test(path)) return 'auth';

  const authz = req.headers?.authorization;
  if (
    (typeof authz === 'string' && /^Bearer\s+\S+/i.test(authz)) ||
    req.headers?.['x-api-key']
  ) {
    return 'authenticated';
  }
  return 'public';
}

export function tierOf(context: ExecutionContext): ThrottleTier {
  return resolveThrottleTier(context.switchToHttp().getRequest());
}

/**
 * True when the handler or its controller declared an explicit
 * `@Throttle({ [name]: ... })` override. Used so the opt-in `strict`/`default`
 * throttlers only apply where a route asked for them.
 */
export function hasThrottleOverride(context: ExecutionContext, name: string): boolean {
  const key = `THROTTLER:LIMIT${name}`;
  return (
    Reflect.getMetadata(key, context.getHandler()) !== undefined ||
    Reflect.getMetadata(key, context.getClass()) !== undefined
  );
}
