import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AddressesService } from './addresses.service';

jest.mock('@stellar/stellar-sdk', () => {
  const validStellarAddress =
    'GBZXN7PIRZGNMHGA7D3TLXWGABSIJHKRNM5Z7HCFVQ7WFMJDBJJLKGZ';
  const validStellarAddress2 =
    'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

  const strKey = {
    isValidEd25519PublicKey: jest.fn(
      (address: string) =>
        address === validStellarAddress || address === validStellarAddress2,
    ),
  };

  return {
    __esModule: true,
    default: {
      Keypair: {
        random: jest.fn(() => ({
          publicKey: () =>
            'GNEWADDRESS123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567',
        })),
      },
      StrKey: strKey,
    },
    StrKey: strKey,
  };
});

const VALID_STELLAR_ADDRESS =
  'GBZXN7PIRZGNMHGA7D3TLXWGABSIJHKRNM5Z7HCFVQ7WFMJDBJJLKGZ';

const mockAddress = {
  id: 'address-uuid',
  walletId: null,
  address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
  network: 'STELLAR',
  label: null,
  isActive: true,
  allocatedAt: null,
  lastActivityAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockWallet = {
  id: 'wallet-uuid',
  userId: 'user-uuid',
  network: 'STELLAR',
  depositAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
  label: null,
  dailyLimit: 1000,
  monthlyLimit: 10000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockDepositAddress = {
  id: 'addr-uuid',
  address: 'GNEWADDRESS123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567',
  walletId: 'wallet-uuid',
  network: 'STELLAR',
  status: 'ALLOCATED',
  label: null,
  allocatedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const buildMockPrisma = (
  overrides: Partial<{
    address: any;
    addressNull: boolean;
    wallet: any;
    depositAddress: any;
    created: any;
  }> = {},
) => {
  const mock = {
    address: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === 'not-found' || where.address === 'nonexistent')
          return null;
        if (overrides.addressNull) return null;
        if ('address' in overrides) return overrides.address;
        if (where.id) return mockAddress;
        return null;
      }),
      findMany: jest.fn().mockResolvedValue([mockAddress]),
      create: jest.fn().mockResolvedValue(mockAddress),
      update: jest.fn().mockResolvedValue(mockAddress),
      delete: jest.fn().mockResolvedValue(mockAddress),
      upsert: jest.fn().mockResolvedValue(mockAddress),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    wallet: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === 'not-found') return null;
        return 'wallet' in overrides ? overrides.wallet : mockWallet;
      }),
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where?.id === 'not-found' || where?.id === 'bad-id') return null;
        return 'wallet' in overrides ? overrides.wallet : mockWallet;
      }),
    },
    depositAddress: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        return 'depositAddress' in overrides ? overrides.depositAddress : null;
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) => {
        return 'created' in overrides
          ? overrides.created
          : { ...mockDepositAddress, ...data };
      }),
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        return [mockDepositAddress];
      }),
      update: jest.fn().mockImplementation(({ data }: any) => {
        return { ...mockDepositAddress, ...data };
      }),
    },
  };
  return mock;
};

describe('AddressesService', () => {
  let service: AddressesService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    prisma = buildMockPrisma();
    // @ts-ignore
    service = new AddressesService(prisma);
  });

  describe('create', () => {
    it('creates an address', async () => {
      const result = await service.create({
        address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
      });
      expect(result).toHaveProperty('id', 'address-uuid');
      expect(result).toHaveProperty('address');
      expect(result.network).toBe('STELLAR');
      expect(result.isActive).toBe(true);
    });

    it('throws ConflictException if address already exists', async () => {
      const conflictPrisma = buildMockPrisma({ address: mockAddress });
      // @ts-ignore
      service = new AddressesService(conflictPrisma);
      await expect(
        service.create({
          address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('sets allocatedAt when walletId is provided', async () => {
      const result = await service.create({
        address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
        walletId: 'wallet-uuid',
      });
      expect(result).toBeDefined();
      expect(prisma.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            walletId: 'wallet-uuid',
            allocatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws NotFoundException if wallet does not exist', async () => {
      const noWalletPrisma = buildMockPrisma({ addressNull: true });
      // @ts-ignore
      service = new AddressesService(noWalletPrisma);
      await expect(
        service.create({
          address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
          walletId: 'not-found',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns all addresses', async () => {
      const results = await service.findAll();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('findOne', () => {
    it('returns an address by id', async () => {
      const result = await service.findOne('address-uuid');
      expect(result).toHaveProperty('id', 'address-uuid');
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(service.findOne('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByAddress', () => {
    it('returns an address by address string', async () => {
      const addrPrisma = buildMockPrisma({ address: mockAddress });
      // @ts-ignore
      service = new AddressesService(addrPrisma);
      const result = await service.findByAddress(
        'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
      );
      expect(result).toHaveProperty('address');
    });

    it('throws NotFoundException for unknown address', async () => {
      await expect(service.findByAddress('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByWallet', () => {
    it('returns addresses for a wallet', async () => {
      const results = await service.findByWallet('wallet-uuid');
      expect(Array.isArray(results)).toBe(true);
      expect(prisma.address.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { walletId: 'wallet-uuid' },
        }),
      );
    });
  });

  describe('update', () => {
    it('updates an address', async () => {
      const result = await service.update('address-uuid', { label: 'Updated' });
      expect(result).toBeDefined();
      expect(prisma.address.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'address-uuid' },
        }),
      );
    });

    it('sets allocatedAt when allocating previously unallocated address', async () => {
      const unallocatedPrisma = buildMockPrisma({
        address: { ...mockAddress, walletId: null, allocatedAt: null },
      });
      // @ts-ignore
      service = new AddressesService(unallocatedPrisma);

      await service.update('address-uuid', { walletId: 'wallet-uuid' });
      expect(unallocatedPrisma.address.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            walletId: 'wallet-uuid',
            allocatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws NotFoundException if address does not exist', async () => {
      const missingPrisma = buildMockPrisma();
      missingPrisma.address.findUnique.mockResolvedValue(null);
      // @ts-ignore
      service = new AddressesService(missingPrisma);
      await expect(
        service.update('not-found', { label: 'Nope' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes an address', async () => {
      await expect(service.remove('address-uuid')).resolves.toBeUndefined();
    });

    it('throws NotFoundException if address does not exist', async () => {
      const missingPrisma = buildMockPrisma();
      missingPrisma.address.findUnique.mockResolvedValue(null);
      // @ts-ignore
      service = new AddressesService(missingPrisma);
      await expect(service.remove('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('touchActivity', () => {
    it('updates lastActivityAt', async () => {
      await service.touchActivity('address-uuid');
      expect(prisma.address.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'address-uuid' },
          data: { lastActivityAt: expect.any(Date) },
        }),
      );
    });
  });

  describe('generate', () => {
    it('generates and returns a new deposit address for a valid wallet', async () => {
      const result = await service.generate('user-uuid', {
        walletId: 'wallet-uuid',
      });
      expect(result).toHaveProperty('id', 'addr-uuid');
      expect(result).toHaveProperty(
        'address',
        'GNEWADDRESS123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567',
      );
      expect(result).toHaveProperty('walletId', 'wallet-uuid');
      expect(result).toHaveProperty('status', 'ALLOCATED');
      expect(result).toHaveProperty('allocatedAt');
    });

    it('persists the generated address via prisma.depositAddress.create', async () => {
      await service.generate('user-uuid', {
        walletId: 'wallet-uuid',
        label: 'test-label',
      });
      expect(prisma.depositAddress.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            walletId: 'wallet-uuid',
            label: 'test-label',
          }),
        }),
      );
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      const p = buildMockPrisma({ wallet: null });
      // @ts-ignore
      service = new AddressesService(p);
      await expect(
        service.generate('user-uuid', { walletId: 'bad-id' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when wallet belongs to a different user', async () => {
      const p = buildMockPrisma({
        wallet: { ...mockWallet, userId: 'other-user' },
      });
      // @ts-ignore
      service = new AddressesService(p);
      await expect(
        service.generate('user-uuid', { walletId: 'wallet-uuid' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('retries if generated address already exists and succeeds on second attempt', async () => {
      const StellarSdk = require('@stellar/stellar-sdk').default;
      const call = 0;
      StellarSdk.Keypair.random
        .mockImplementationOnce(() => ({ publicKey: () => 'DUPLICATE_ADDR' }))
        .mockImplementationOnce(() => ({ publicKey: () => 'UNIQUE_ADDR' }));

      prisma.depositAddress.findUnique
        .mockResolvedValueOnce({ id: 'existing' }) // first address is taken
        .mockResolvedValueOnce(null); // second is unique

      prisma.depositAddress.create.mockResolvedValueOnce({
        ...mockDepositAddress,
        address: 'UNIQUE_ADDR',
      });

      const result = await service.generate('user-uuid', {
        walletId: 'wallet-uuid',
      });
      expect(result.address).toBe('UNIQUE_ADDR');
    });
  });

  describe('listByWallet', () => {
    it('returns all deposit addresses for a wallet', async () => {
      const result = await service.listByWallet('user-uuid', 'wallet-uuid');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('walletId', 'wallet-uuid');
    });

    it('throws NotFoundException if wallet not found', async () => {
      const p = buildMockPrisma({ wallet: null });
      // @ts-ignore
      service = new AddressesService(p);
      await expect(service.listByWallet('user-uuid', 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException if wallet belongs to another user', async () => {
      const p = buildMockPrisma({
        wallet: { ...mockWallet, userId: 'other-user' },
      });
      // @ts-ignore
      service = new AddressesService(p);
      await expect(
        service.listByWallet('user-uuid', 'wallet-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyAddress', () => {
    it('returns valid: true for a well-formed Stellar address', () => {
      const result = service.verifyAddress(VALID_STELLAR_ADDRESS);
      expect(result.valid).toBe(true);
      expect(result.address).toBe(VALID_STELLAR_ADDRESS);
      expect(result.reason).toBeUndefined();
    });

    it('returns valid: false when address does not start with G', () => {
      const result = service.verifyAddress(
        'XBZXN7PIRZGNMHGA7D3TLXWGABSIJHKRNM5Z7HCFVQ7WFMJDBJJLKGZ',
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/must start with G/i);
    });

    it('returns valid: false for an M-address (muxed account, not Ed25519 key)', () => {
      const result = service.verifyAddress(
        'MA7QYNF7SOWQ3GLR2BGMZEHXR77GVDQK7JVZJZJZJZJZJZJZVVAAAAAAAAAAAPCIB',
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/must start with G/i);
    });

    it('returns valid: false for an address with a corrupted checksum', () => {
      // Same length as valid address, starts with G, but last char changed
      const corrupted = VALID_STELLAR_ADDRESS.slice(0, -1) + 'A';
      const result = service.verifyAddress(corrupted);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/checksum|malformed/i);
    });

    it('returns valid: false for an address that is too short', () => {
      const result = service.verifyAddress('GBZXN7');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/checksum|malformed/i);
    });

    it('returns valid: false for an empty string', () => {
      const result = service.verifyAddress('');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/must start with G/i);
    });

    it('echoes the input address in the response regardless of validity', () => {
      const addr = 'GBAD_CHECKSUM_ADDRESS';
      const result = service.verifyAddress(addr);
      expect(result.address).toBe(addr);
    });
  });

  describe('generateMemo', () => {
    it('generates a valid deposit memo for a wallet', async () => {
      const result = await service.generateMemo('user-uuid', {
        walletId: 'wallet-uuid',
        memoType: 'id' as any,
      });
      expect(result).toHaveProperty('walletId', 'wallet-uuid');
      expect(result).toHaveProperty('memoType', 'id');
      expect(result).toHaveProperty('memoValue');
    });

    it('throws NotFoundException if wallet does not exist or belongs to another user', async () => {
      const p = buildMockPrisma({ wallet: null });
      // @ts-ignore
      service = new AddressesService(p);
      await expect(
        service.generateMemo('user-uuid', { walletId: 'bad-id' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateMemo', () => {
    it('validates memo format and routability', async () => {
      const result = await service.validateMemo({
        memoType: 'text',
        memoValue: 'valid-note',
      });
      expect(result.valid).toBe(true);
      expect(result.memoType).toBe('text');
      expect(result.memoValue).toBe('valid-note');
    });

    it('returns invalid status for malformed memo', async () => {
      const result = await service.validateMemo({
        memoType: 'id',
        memoValue: 'non-numeric',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('resolveDeposit', () => {
    it('resolves deposit destination to matching wallet', async () => {
      const gAddr = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';
      const p = buildMockPrisma({
        wallet: { ...mockWallet, depositAddress: gAddr },
      });
      // @ts-ignore
      service = new AddressesService(p);

      const result = await service.resolveDeposit({
        destination: gAddr,
        memoType: 'id',
        memoValue: '123',
      });

      expect(result.routed).toBe(true);
      expect(result.walletId).toBe('wallet-uuid');
      expect(result.userId).toBe('user-uuid');
    });
  });
});
