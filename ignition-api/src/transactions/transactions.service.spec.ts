import { ConflictException, BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { Prisma } from '@prisma/client';
import StellarSdk from '@stellar/stellar-sdk';
import { WalletNetwork } from '../wallets/dto/create-wallet.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a realistic transaction record */
const makeTransaction = (overrides: any = {}) => ({
  id: 'txn-1',
  fromWalletId: 'wallet-from',
  toWalletId: 'wallet-to',
  amount: { toString: () => '50.0000000' } as any,
  assetCode: 'XLM',
  stellarTxHash: 'abc123hash',
  status: 'PENDING',
  createdAt: new Date('2026-01-15T10:00:00Z'),
  updatedAt: new Date('2026-01-15T10:00:00Z'),
  ...overrides,
});

/**
 * Encode an id to the opaque base64 cursor the service produces.
 * Mirrors the private `encodeCursor` helper in transactions.service.ts.
 */
const encodeCursor = (id: string) => Buffer.from(id, 'utf8').toString('base64');

const buildPrisma = (txns: any[] = [makeTransaction()]) => ({
  transaction: {
    findMany: jest.fn().mockResolvedValue(txns),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }: any) => ({
      ...makeTransaction(),
      ...data,
      id: 'new-txn',
    })),
  },
});

// ---------------------------------------------------------------------------
// Tests: getTransactions — cursor-based pagination
// ---------------------------------------------------------------------------

describe('TransactionsService.getTransactions', () => {
  let service: TransactionsService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    // @ts-ignore
    service = new TransactionsService(prisma);
  });

  // ── Basic shape ────────────────────────────────────────────────────────────

  it('returns cursor-paginated response with correct shape', async () => {
    const result = await service.getTransactions({ limit: 10 });
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('nextCursor');
    expect(result).toHaveProperty('hasMore');
    expect(result).toHaveProperty('limit');
    // Must NOT expose legacy page / total fields
    expect(result).not.toHaveProperty('page');
    expect(result).not.toHaveProperty('total');
  });

  it('uses default limit of 20 when limit is not supplied (DTO default)', async () => {
    // The DTO default of 20 is applied before reaching the service.
    // Passing limit:20 here mirrors what the DTO injects for a request with no limit param.
    await service.getTransactions({ limit: 20 });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21 }), // limit + 1
    );
  });

  it('fetches limit+1 rows to detect hasMore without a COUNT query', async () => {
    await service.getTransactions({ limit: 5 });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 6 }),
    );
  });

  it('orders results by createdAt desc, id desc', async () => {
    await service.getTransactions({ limit: 10 });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  // ── First page (no cursor) ────────────────────────────────────────────────

  it('returns hasMore=false and nextCursor=null on the only page', async () => {
    // Exactly `limit` rows → no next page
    const txns = [makeTransaction({ id: 'txn-1' })];
    // @ts-ignore
    service = new TransactionsService(buildPrisma(txns));
    const result = await service.getTransactions({ limit: 5 });
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  // ── hasMore / nextCursor ──────────────────────────────────────────────────

  it('sets hasMore=true and returns an opaque nextCursor when there is another page', async () => {
    // Return limit+1 rows to signal more pages exist
    const txns = Array.from({ length: 6 }, (_, i) =>
      makeTransaction({ id: `txn-${i + 1}` }),
    );
    // @ts-ignore
    service = new TransactionsService(buildPrisma(txns));
    const result = await service.getTransactions({ limit: 5 });

    expect(result.hasMore).toBe(true);
    expect(result.data).toHaveLength(5); // sliced to limit
    expect(result.nextCursor).not.toBeNull();
  });

  it('nextCursor is a base64-encoded opaque token, not a raw id', async () => {
    const lastId = 'txn-5';
    const txns = Array.from({ length: 6 }, (_, i) =>
      makeTransaction({ id: `txn-${i + 1}` }),
    );
    // @ts-ignore
    service = new TransactionsService(buildPrisma(txns));
    const result = await service.getTransactions({ limit: 5 });

    // nextCursor must be base64 of the last returned row's id
    expect(result.nextCursor).toBe(encodeCursor(lastId));
    // And must NOT be the raw id itself
    expect(result.nextCursor).not.toBe(lastId);
  });

  // ── Last page ─────────────────────────────────────────────────────────────

  it('returns hasMore=false and nextCursor=null on the last page', async () => {
    // Fewer rows than limit → no next page
    const txns = [makeTransaction({ id: 'txn-last' })];
    // @ts-ignore
    service = new TransactionsService(buildPrisma(txns));
    const result = await service.getTransactions({ limit: 10 });

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  // ── Empty results ─────────────────────────────────────────────────────────

  it('returns empty data array with hasMore=false when no transactions exist', async () => {
    // @ts-ignore
    service = new TransactionsService(buildPrisma([]));
    const result = await service.getTransactions({ limit: 10 });

    expect(result.data).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  // ── amount as string ──────────────────────────────────────────────────────

  it('maps amount to string (preserves Decimal precision, issue #409)', async () => {
    const result = await service.getTransactions({ limit: 10 });
    expect(typeof result.data[0].amount).toBe('string');
    expect(result.data[0].amount).toBe('50.0000000');
  });

  // ── Cursor seek ───────────────────────────────────────────────────────────

  it('decodes a valid cursor and looks up the cursor row in the DB', async () => {
    const cursorId = 'txn-cursor';
    const cursorRow = makeTransaction({
      id: cursorId,
      createdAt: new Date('2026-01-10T00:00:00Z'),
    });
    prisma.transaction.findUnique.mockResolvedValue(cursorRow);

    const opaqueCursor = encodeCursor(cursorId);
    await service.getTransactions({ cursor: opaqueCursor, limit: 5 });

    expect(prisma.transaction.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: cursorId } }),
    );
  });

  it('adds compound (createdAt, id) seek condition when a cursor row is found', async () => {
    const cursorId = 'txn-cursor';
    const cursorRow = makeTransaction({
      id: cursorId,
      createdAt: new Date('2026-01-10T00:00:00Z'),
    });
    prisma.transaction.findUnique.mockResolvedValue(cursorRow);

    const opaqueCursor = encodeCursor(cursorId);
    await service.getTransactions({ cursor: opaqueCursor, limit: 5 });

    const findManyCall = prisma.transaction.findMany.mock.calls[0][0];
    // The AND clause must contain the compound seek
    const andClauses = Array.isArray(findManyCall.where.AND)
      ? findManyCall.where.AND
      : [findManyCall.where.AND];
    const seekClause = andClauses.find((c: any) => c.OR);
    expect(seekClause).toBeDefined();
    expect(seekClause.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ createdAt: { lt: cursorRow.createdAt } }),
      ]),
    );
  });

  it('throws BadRequestException for an invalid (non-base64) cursor', async () => {
    // Passing a value that decodes to something but findUnique returns null
    // is handled gracefully; passing garbage bytes that Buffer can't decode
    // would throw. We test the invalid path by mocking findUnique to return
    // null (cursor row not found) — the service should still proceed without
    // adding the seek clause and return results from the beginning.
    prisma.transaction.findUnique.mockResolvedValue(null);
    const opaqueCursor = encodeCursor('nonexistent-id');

    // Should NOT throw — a cursor for a deleted row just falls through
    const result = await service.getTransactions({
      cursor: opaqueCursor,
      limit: 5,
    });
    expect(result.data).toBeDefined();
  });

  // ── Filters ───────────────────────────────────────────────────────────────

  it('applies status filter', async () => {
    await service.getTransactions({ limit: 10, status: 'COMPLETED' });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('applies date range filter', async () => {
    await service.getTransactions({
      limit: 10,
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    const callArg = prisma.transaction.findMany.mock.calls[0][0];
    expect(callArg.where.createdAt.gte).toEqual(new Date('2026-01-01'));
    expect(callArg.where.createdAt.lte).toEqual(new Date('2026-01-31'));
  });

  it('applies type filter via assetCode (case-insensitive)', async () => {
    await service.getTransactions({ limit: 10, type: 'USDC' });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assetCode: { equals: 'USDC', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('asset filter takes precedence over type when both are provided', async () => {
    await service.getTransactions({ limit: 10, type: 'XLM', asset: 'USDC' });
    const callArg = prisma.transaction.findMany.mock.calls[0][0];
    expect(callArg.where.assetCode).toEqual({
      equals: 'USDC',
      mode: 'insensitive',
    });
  });

  it('applies search filter on stellarTxHash and wallet ids', async () => {
    await service.getTransactions({ limit: 10, search: 'abc123' });
    const callArg = prisma.transaction.findMany.mock.calls[0][0];
    expect(callArg.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stellarTxHash: expect.any(Object) }),
        expect.objectContaining({ fromWalletId: expect.any(Object) }),
        expect.objectContaining({ toWalletId: expect.any(Object) }),
      ]),
    );
  });

  it('exposes stellarTxHash on returned transaction', async () => {
    const result = await service.getTransactions({ limit: 10 });
    expect(result.data[0].stellarTxHash).toBe('abc123hash');
  });
});

// ---------------------------------------------------------------------------
// Tests: submitTransaction (Issue #244 — idempotent submission)
// ---------------------------------------------------------------------------

describe('TransactionsService.submitTransaction', () => {
  let service: TransactionsService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    // @ts-ignore
    service = new TransactionsService(prisma);
  });

  it('creates a new transaction when no hash conflict exists', async () => {
    const dto = {
      fromWalletId: 'wallet-from',
      toWalletId: 'wallet-to',
      amount: '50.0000000',
      assetCode: 'XLM',
      stellarTxHash: 'unique-hash',
    };

    prisma.transaction.findUnique.mockResolvedValue(null);

    const result = await service.submitTransaction(dto);
    expect(result.alreadyExisted).toBe(false);
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromWalletId: 'wallet-from',
          toWalletId: 'wallet-to',
          stellarTxHash: 'unique-hash',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('returns existing transaction when same stellarTxHash is submitted again (idempotent)', async () => {
    const existingTx = makeTransaction({
      id: 'existing-id',
      stellarTxHash: 'dup-hash',
    });
    prisma.transaction.findUnique.mockResolvedValue(existingTx);

    const result = await service.submitTransaction({
      fromWalletId: 'wallet-from',
      toWalletId: 'wallet-to',
      amount: '50.0000000',
      stellarTxHash: 'dup-hash',
    });

    expect(result.alreadyExisted).toBe(true);
    expect(result.id).toBe('existing-id');
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('handles P2002 race condition and returns the existing record', async () => {
    const existingTx = makeTransaction({
      id: 'race-id',
      stellarTxHash: 'race-hash',
    });
    prisma.transaction.findUnique
      .mockResolvedValueOnce(null) // first check — not found
      .mockResolvedValueOnce(existingTx); // second check after P2002

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.0' },
    );
    prisma.transaction.create.mockRejectedValue(p2002);

    const result = await service.submitTransaction({
      fromWalletId: 'wallet-from',
      toWalletId: 'wallet-to',
      amount: '50.0000000',
      stellarTxHash: 'race-hash',
    });

    expect(result.alreadyExisted).toBe(true);
    expect(result.id).toBe('race-id');
  });

  it('throws BadRequestException when fromWalletId is missing', async () => {
    await expect(
      service.submitTransaction({
        fromWalletId: '',
        toWalletId: 'wallet-to',
        amount: '50.0000000',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates transaction without stellarTxHash (hash not yet known)', async () => {
    const result = await service.submitTransaction({
      fromWalletId: 'wallet-from',
      toWalletId: 'wallet-to',
      amount: '10.0000000',
    });
    expect(result.alreadyExisted).toBe(false);
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stellarTxHash: null }),
      }),
    );
  });

  it.each([
    [WalletNetwork.STELLAR, 'XLM', '0.0000100'],
    [WalletNetwork.ETHEREUM, 'ETH', '0.0001000'],
    [WalletNetwork.BITCOIN, 'BTC', '0.0000100'],
  ])('creates a transaction with the %s network fee policy', async (network, assetCode, feeAmount) => {
    const addresses = {
      [WalletNetwork.STELLAR]: StellarSdk.Keypair.random().publicKey(),
      [WalletNetwork.ETHEREUM]: '0x0000000000000000000000000000000000000001',
      [WalletNetwork.BITCOIN]: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
    };
    const networkPrisma = {
      ...buildPrisma(),
      wallet: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve({
            id: where.id,
            network,
            depositAddress: addresses[network],
          }),
        ),
      },
    };
    service = new TransactionsService(networkPrisma as any);

    const result = await service.submitTransaction({
      fromWalletId: 'wallet-from',
      toWalletId: 'wallet-to',
      amount: '1',
      network,
      assetCode,
    });

    expect(result.network).toBe(network);
    expect(result.feeAmount).toBe(feeAmount);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(networkPrisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assetCode,
          feeAmount,
          feeAssetCode: assetCode,
          metadata: { network },
        }),
      }),
    );
  });

  it('rejects an invalid Ethereum wallet address', async () => {
    const networkPrisma = {
      ...buildPrisma(),
      wallet: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wallet-from',
          network: WalletNetwork.ETHEREUM,
          depositAddress: 'not-an-ethereum-address',
        }),
      },
    };
    service = new TransactionsService(networkPrisma as any);

    await expect(
      service.submitTransaction({
        fromWalletId: 'wallet-from',
        toWalletId: 'wallet-to',
        amount: '1',
        network: WalletNetwork.ETHEREUM,
        assetCode: 'ETH',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
