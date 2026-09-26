import { PermissionsService } from './permissions.service';
import { Permission, UserRole } from './permissions.map';

describe('PermissionsService', () => {
  const service = new PermissionsService();

  describe('getUserPermissions', () => {
    it('returns permissions for USER role', () => {
      const perms = service.getUserPermissions(UserRole.USER);
      expect(perms).toContain(Permission.WALLET_READ);
      expect(perms).toContain(Permission.USER_READ_OWN);
      expect(perms).not.toContain(Permission.ADMIN_USERS_KYC);
    });

    it('returns all permissions for ADMIN role', () => {
      const perms = service.getUserPermissions(UserRole.ADMIN);
      expect(perms).toContain(Permission.ADMIN_USERS_KYC);
      expect(perms).toContain(Permission.ADMIN_USERS_ROLE);
      expect(perms).toContain(Permission.WALLET_CREATE);
    });

    it('CREATOR can create campaigns, USER cannot', () => {
      expect(service.getUserPermissions(UserRole.CREATOR)).toContain(
        Permission.CAMPAIGN_CREATE,
      );
      expect(service.getUserPermissions(UserRole.USER)).not.toContain(
        Permission.CAMPAIGN_CREATE,
      );
    });

    it('returns empty array for unknown role', () => {
      expect(service.getUserPermissions('UNKNOWN')).toEqual([]);
    });
  });

  describe('hasPermission', () => {
    it('returns true when role has permission', () => {
      expect(
        service.hasPermission(UserRole.ADMIN, Permission.ADMIN_USERS_KYC),
      ).toBe(true);
    });

    it('returns false when role lacks permission', () => {
      expect(
        service.hasPermission(UserRole.USER, Permission.ADMIN_USERS_KYC),
      ).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Issue #230 — JWT scope-claim helpers
  // ────────────────────────────────────────────────────────────────────────

  describe('toScopeString', () => {
    it('joins permissions with a single space', () => {
      expect(
        service.toScopeString([
          Permission.WALLET_READ,
          Permission.WALLET_CREATE,
        ]),
      ).toBe(`${Permission.WALLET_READ} ${Permission.WALLET_CREATE}`);
    });

    it('returns an empty string when the input is empty', () => {
      expect(service.toScopeString([])).toBe('');
    });

    it('drops empty entries defensively', () => {
      // Matches the runtime shape callers typically build (a list of
      // raw strings mined from a JWT claim). The helper's `.filter()`
      // drops elements with `length === 0` before joining.
      expect(service.toScopeString(['wallet:read', ''])).toBe('wallet:read');
    });
  });

  describe('parseScopeString', () => {
    it('splits a well-formed scope string into tokens', () => {
      expect(
        service.parseScopeString(
          `${Permission.WALLET_READ} ${Permission.WALLET_CREATE}`,
        ),
      ).toEqual([Permission.WALLET_READ, Permission.WALLET_CREATE]);
    });

    it('returns [] for null / undefined / non-strings', () => {
      expect(service.parseScopeString(undefined)).toEqual([]);
      expect(service.parseScopeString(null)).toEqual([]);
      expect(service.parseScopeString('')).toEqual([]);
    });

    it('tolerates extra whitespace and dedupes', () => {
      expect(
        service.parseScopeString(
          `  ${Permission.WALLET_READ}   ${Permission.WALLET_READ}  ${Permission.WALLET_CREATE}  `,
        ),
      ).toEqual([Permission.WALLET_READ, Permission.WALLET_CREATE]);
    });
  });

  describe('getScopeStringForRole', () => {
    it('emits a space-delimited scope string for a known role', () => {
      const scope = service.getScopeStringForRole(UserRole.USER);
      expect(scope).toContain(Permission.WALLET_READ);
      expect(scope).not.toContain(Permission.ADMIN_USERS_KYC);
      // Multi-permission roles must be space-joined, not comma-joined.
      expect(scope).not.toContain(',');
    });

    it('returns an empty string for an unknown role', () => {
      expect(service.getScopeStringForRole('NOPE')).toBe('');
    });
  });
});
