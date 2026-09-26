// Mirrors the UserRole values from prisma/schema.prisma without depending on
// @prisma/client (which requires a generated client that may not be available).
export const UserRole = {
  USER: 'USER',
  DONOR: 'DONOR',
  CREATOR: 'CREATOR',
  MERCHANT: 'MERCHANT',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export enum Permission {
  WALLET_CREATE = 'wallet:create',
  WALLET_READ = 'wallet:read',
  WALLET_READ_ANY = 'wallet:read:any',

  TRANSACTION_READ = 'transaction:read',
  TRANSACTION_READ_ANY = 'transaction:read:any',
  TRANSACTION_CREATE = 'transaction:create',

  CAMPAIGN_CREATE = 'campaign:create',
  CAMPAIGN_READ = 'campaign:read',
  CAMPAIGN_UPDATE_OWN = 'campaign:update:own',
  CAMPAIGN_UPDATE_ANY = 'campaign:update:any',

  ADDRESS_READ = 'address:read',
  ADDRESS_CREATE = 'address:create',

  USER_READ_OWN = 'user:read:own',
  USER_UPDATE_OWN = 'user:update:own',
  USER_READ_ANY = 'user:read:any',
  USER_UPDATE_ANY = 'user:update:any',

  APIKEY_MANAGE_OWN = 'apikey:manage:own',
  APIKEY_MANAGE_ANY = 'apikey:manage:any',

  ADMIN_USERS_KYC = 'admin:users:kyc',
  ADMIN_USERS_ROLE = 'admin:users:role',
}

const BASE_PERMISSIONS: Permission[] = [
  Permission.WALLET_CREATE,
  Permission.WALLET_READ,
  Permission.TRANSACTION_READ,
  Permission.TRANSACTION_CREATE,
  Permission.CAMPAIGN_READ,
  Permission.ADDRESS_READ,
  Permission.ADDRESS_CREATE,
  Permission.USER_READ_OWN,
  Permission.USER_UPDATE_OWN,
  Permission.APIKEY_MANAGE_OWN,
];

const CREATOR_PERMISSIONS: Permission[] = [
  ...BASE_PERMISSIONS,
  Permission.CAMPAIGN_CREATE,
  Permission.CAMPAIGN_UPDATE_OWN,
];

const MERCHANT_PERMISSIONS: Permission[] = [
  ...BASE_PERMISSIONS,
  Permission.CAMPAIGN_CREATE,
  Permission.CAMPAIGN_UPDATE_OWN,
  Permission.TRANSACTION_READ_ANY,
];

const ADMIN_PERMISSIONS: Permission[] = Object.values(Permission);

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [UserRole.USER]: BASE_PERMISSIONS,
  [UserRole.DONOR]: BASE_PERMISSIONS,
  [UserRole.CREATOR]: CREATOR_PERMISSIONS,
  [UserRole.MERCHANT]: MERCHANT_PERMISSIONS,
  [UserRole.ADMIN]: ADMIN_PERMISSIONS,
};
