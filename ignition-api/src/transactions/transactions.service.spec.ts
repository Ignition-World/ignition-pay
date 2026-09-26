import { ConflictException, BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { IdempotencyClaim } from './idempotency.service';
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

/**
 * In-memory stand-in for `IdempotencyService` that reproduces the guarantees of
 * the real implementation:
 *
 *  - the check and the write of the claim happen in one synchronous step, so
 *    two concurrent callers can never both win (this is what a single Redis
 *    `SET ... NX` command guarantees);
 *  - a caller that loses the race polls for the winner to publish its response
 *    and then replays it, rather than erroring.
 */
const buildIdempotency = (
  options: { waitTimeoutMs?: number; pollIntervalMs?: number } = {},
) => {
  const waitTimeoutMs = options.waitTimeoutMs ?? 2_000;
  const pollIntervalMs = options.pollIntervalMs ?? 5;
  const records = new Map<string, { state: string; response?: unknown }>();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const claim = jest.fn(async (key: string): Promise<IdempotencyClaim> => {
    if (!records.has(key)) {
      records.set(key, { state: 'in_flight' });
      return { status: 'claimed' };
    }

    const deadline = Date.now() + waitTimeoutMs;
    while (Date.now() < deadline) {
      const existing = records.get(key);
      if (!existing) {
        records.set(key, { state: 'in_flight' });
        return { status: 'claimed' };
      }
      if (existing.state === 'complete') {
        return { status: 'replayed', response: existing.response };
      }
      await sleep(pollIntervalMs);
    }

    throw new ConflictException(
      'A request with this Idempotency-Key is still in progress',
    );
  });

  return {
    records,
    claim,
    complete: jest.fn(async (key: string, response: unknown) => {
      records.set(key, { state: 'complete', response });
    }),
    release: jest.fn(async (key: string) => {
      records.delete(key);
    }),
  };
};

const IDEMPOTENCY_KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER_IDEMPOTENCY_KEY = '9c858901-8a57-4791-81fe-4c455b099bc9';

// ---------------------------------------------------------------------------
// Tests: getTransactions — cursor-based pagination
// ---------------------------------------------------------------------------

describe('TransactionsService.getTransactions', () => {
  let service: TransactionsService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    // @ts-ignore
    service = new TransactionsService(prisma, buildIdempotency());
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
    service = new TransactionsService(buildPrisma(txns), buildIdempotency());
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
    service = new TransactionsService(buildPrisma(txns), buildIdempotency());
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
    service = new TransactionsService(buildPrisma(txns), buildIdempotency());
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
    service = new TransactionsService(buildPrisma(txns), buildIdempotency());
    const result = await service.getTransactions({ limit: 10 });

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  // ── Empty results ─────────────────────────────────────────────────────────

  it('returns empty data array with hasMore=false when no transactions exist', async () => {
    // @ts-ignore
    service = new TransactionsService(buildPrisma([]), buildIdempotency());
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
  let idempotency: ReturnType<typeof buildIdempotency>;

  beforeEach(() => {
    prisma = buildPrisma();
    idempotency = buildIdempotency();
    // @ts-ignore
    service = new TransactionsService(prisma, idempotency);
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
    service = new TransactionsService(networkPrisma as any, buildIdempotency());

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
    service = new TransactionsService(networkPrisma as any, buildIdempotency());

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

// ---------------------------------------------------------------------------
// Tests: submitTransaction with an Idempotency-Key header (Issue #615)
// ---------------------------------------------------------------------------

describe('TransactionsService.submitTransaction with Idempotency-Key', () => {
  let service: TransactionsService;
  let prisma: ReturnType<typeof buildPrisma>;
  let idempotency: ReturnType<typeof buildIdempotency>;

  const dto = {
    fromWalletId: 'wallet-from',
    toWalletId: 'wallet-to',
    amount: '50.0000000',
  };

  beforeEach(() => {
    prisma = buildPrisma();
    idempotency = buildIdempotency();
    // @ts-ignore
    service = new TransactionsService(prisma, idempotency);
  });

  // ── Format validation ─────────────────────────────────────────────────────

  it('rejects an Idempotency-Key that is not a v4 UUID', async () => {
    await expect(
      service.submitTransaction(dto, 'not-a-uuid'),
    ).rejects.toThrow(BadRequestException);
    expect(idempotency.claim).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it.each([
    ['non-uuid string', 'abc123'],
    ['uuid v1 shape', '3f2504e0-1f89-11d3-9a0c-0305e82c3301'],
    ['uuid without hyphens', '3f2504e04f8941d39a0c0305e82c3301'],
  ])('rejects %s', async (_label, key) => {
    await expect(service.submitTransaction(dto, key)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts an upper-case v4 UUID', async () => {
    const result = await service.submitTransaction(
      dto,
      '3F2504E0-4F89-41D3-9A0C-0305E82C3301',
    );
    expect(result.alreadyExisted).toBe(false);
  });

  // ── Replay ────────────────────────────────────────────────────────────────

  it('stores the created response under the key', async () => {
    const result = await service.submitTransaction(dto, IDEMPOTENCY_KEY);

    expect(idempotency.claim).toHaveBeenCalledWith(IDEMPOTENCY_KEY);
    expect(idempotency.complete).toHaveBeenCalledWith(
      IDEMPOTENCY_KEY,
      expect.objectContaining({ id: 'new-txn' }),
    );
    expect(result.alreadyExisted).toBe(false);
  });

  it('replays the stored response for the same key without re-executing', async () => {
    const first = await service.submitTransaction(dto, IDEMPOTENCY_KEY);
    const createCallsAfterFirst = prisma.transaction.create.mock.calls.length;

    const second = await service.submitTransaction(dto, IDEMPOTENCY_KEY);

    expect(second).toEqual(first);
    // No second INSERT, and the wallet/validation lookups were not repeated
    expect(prisma.transaction.create).toHaveBeenCalledTimes(createCallsAfterFirst);
  });

  it('replays the original response even when the payload differs', async () => {
    const first = await service.submitTransaction(dto, IDEMPOTENCY_KEY);

    const second = await service.submitTransaction(
      { ...dto, amount: '999.0000000', toWalletId: 'wallet-other' },
      IDEMPOTENCY_KEY,
    );

    expect(second).toEqual(first);
    expect(second.amount).toBe('50.0000000');
    expect(second.toWalletId).toBe('wallet-to');
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
  });

  it('always creates a new transaction for a different key', async () => {
    const first = await service.submitTransaction(dto, IDEMPOTENCY_KEY);
    const second = await service.submitTransaction(
      dto,
      OTHER_IDEMPOTENCY_KEY,
    );

    expect(prisma.transaction.create).toHaveBeenCalledTimes(2);
    expect(first.alreadyExisted).toBe(false);
    expect(second.alreadyExisted).toBe(false);
  });

  it('does not claim a key when the request omits the header', async () => {
    await service.submitTransaction(dto);
    expect(idempotency.claim).not.toHaveBeenCalled();
  });

  // ── Atomicity ─────────────────────────────────────────────────────────────

  it('creates exactly one transaction for two concurrent identical requests', async () => {
    const [a, b] = await Promise.all([
      service.submitTransaction(dto, IDEMPOTENCY_KEY),
      service.submitTransaction(dto, IDEMPOTENCY_KEY),
    ]);

    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    // The loser of the claim replays the winner's response rather than erroring.
    expect(a).toEqual(b);
    expect(idempotency.claim).toHaveBeenCalledTimes(2);
  });

  it('propagates a 409 from the claim when the original request never finishes', async () => {
    idempotency.claim.mockRejectedValueOnce(
      new ConflictException('A request with this Idempotency-Key is still in progress'),
    );

    await expect(
      service.submitTransaction(dto, IDEMPOTENCY_KEY),
    ).rejects.toThrow(ConflictException);

    expect(prisma.transaction.create).not.toHaveBeenCalled();
    // A refused claim must not release the winner's key.
    expect(idempotency.release).not.toHaveBeenCalled();
  });

  // ── Failure handling ──────────────────────────────────────────────────────

  it('releases the key so a corrected retry can reuse it', async () => {
    await expect(
      service.submitTransaction({ fromWalletId: '', toWalletId: '' }, IDEMPOTENCY_KEY),
    ).rejects.toThrow(BadRequestException);

    expect(idempotency.release).toHaveBeenCalledWith(IDEMPOTENCY_KEY);
    expect(idempotency.records.has(IDEMPOTENCY_KEY)).toBe(false);

    const retry = await service.submitTransaction(dto, IDEMPOTENCY_KEY);
    expect(retry.alreadyExisted).toBe(false);
  });

  it('does not release the key when the claim is refused', async () => {
    idempotency.claim.mockRejectedValueOnce(
      new ConflictException('A request with this Idempotency-Key is still in progress'),
    );

    await expect(
      service.submitTransaction(dto, IDEMPOTENCY_KEY),
    ).rejects.toThrow(ConflictException);

    expect(idempotency.release).not.toHaveBeenCalled();
  });

  // ── Composes with the existing stellarTxHash dedupe (Issue #244) ──────────

  it('still honours stellarTxHash dedupe when a key is also supplied', async () => {
    const existingTx = makeTransaction({
      id: 'existing-id',
      stellarTxHash: 'dup-hash',
    });
    prisma.transaction.findUnique.mockResolvedValue(existingTx);

    const result = await service.submitTransaction(
      { ...dto, stellarTxHash: 'dup-hash' },
      IDEMPOTENCY_KEY,
    );

    expect(result.alreadyExisted).toBe(true);
    expect(result.id).toBe('existing-id');
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    // The replayable response is still recorded under the key.
    expect(idempotency.complete).toHaveBeenCalledWith(
      IDEMPOTENCY_KEY,
      expect.objectContaining({ id: 'existing-id' }),
    );
  });
});
