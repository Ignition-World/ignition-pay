import { Injectable } from '@nestjs/common';
import { Permission, ROLE_PERMISSIONS } from './permissions.map';

@Injectable()
export class PermissionsService {
  /**
   * Issue #407 — In-memory cache for per-role permission arrays.
   *
   * `ROLE_PERMISSIONS` is a static map that never changes at runtime, but
   * every request was calling `getUserPermissions()` which creates a new
   * array reference via the spread operator.  Caching the result avoids
   * repeated allocations and makes `hasPermission()` a simple `includes()`
   * on a frozen array.
   */
  private readonly rolePermissionsCache = new Map<string, readonly Permission[]>();

  getUserPermissions(role: string): Permission[] {
    let cached = this.rolePermissionsCache.get(role);
    if (!cached) {
      cached = Object.freeze([...(ROLE_PERMISSIONS[role] ?? [])]);
      this.rolePermissionsCache.set(role, cached);
    }
    return cached as Permission[];
  }

  hasPermission(role: string, permission: Permission): boolean {
    return this.getUserPermissions(role).includes(permission);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Issue #230 — JWT scope claim
  //
  // Encode the role-derived permission set as a single space-delimited string
  // per RFC 6749 §3.3 ("scope") so it can be carried in one JWT claim and
  // parsed back into a defensive-permission list by JwtStrategy / SessionGuard.
  // The Permission enum values (`wallet:create`, `transaction:read:any`, ...)
  // contain no whitespace, so a single space is a safe delimiter.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Serialize a list of permissions into the OAuth2 `scope` claim format
   * (single space-delimited, no trailing space). Returns an empty string
   * when the input is empty so the JWT claim is always defined.
   */
  toScopeString(permissions: Permission[] | string[]): string {
    if (!permissions || permissions.length === 0) {
      return '';
    }
    return permissions
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .join(' ');
  }

  /**
   * Parse a space-delimited `scope` claim back into a permission list.
   * Trims surrounding whitespace, drops empty segments, and dedupes.
   * Tolerant of extra/missing whitespace so legacy tokens still parse.
   */
  parseScopeString(scope: string | undefined | null): string[] {
    if (!scope || typeof scope !== 'string') return [];
    const seen = new Set<string>();
    for (const seg of scope.split(/\s+/)) {
      const trimmed = seg.trim();
      if (trimmed.length > 0) seen.add(trimmed);
    }
    return [...seen];
  }

  /**
   * Convenience helper: derive the OAuth2 `scope` claim value directly
   * from a role. Equivalent to `toScopeString(getUserPermissions(role))`
   * but avoids the intermediate array allocation on the hot path.
   */
  getScopeStringForRole(role: string): string {
    return this.toScopeString(this.getUserPermissions(role));
  }
}
