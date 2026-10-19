import { TransactionsService } from './transactions.service';

const makeDonation = (overrides: any = {}) => ({
  id: 'txn-1',
  amount: { toNumber: () => 50, valueOf: () => 50 } as any,
  assetCode: 'XLM',
  txHash: 'abc123',
  status: 'CONFIRMED',
  donorId: 'user-1',
  campaignId: 'camp-1',
  donatedAt: new Date('2026-01-15T10:00:00Z'),
  confirmedAt: new Date('2026-01-15T10:05:00Z'),
  createdAt: new Date('2026-01-15T10:00:00Z'),
  ...overrides,
});

const buildPrisma = (donations: any[] = [makeDonation()], total = 1) => ({
  donation: {
    count: jest.fn().mockResolvedValue(total),
    findMany: jest.fn().mockResolvedValue(donations),
  },
});

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    // @ts-ignore
    service = new TransactionsService(prisma);
  });

  it('returns paginated transactions with defaults', async () => {
    const result = await service.getTransactions({ page: 1, limit: 10 });
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(prisma.donation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
  });

  it('maps amount to number and sets type from assetCode', async () => {
    const result = await service.getTransactions({ page: 1, limit: 10 });
    expect(result.data[0].amount).toBe(50);
    expect(result.data[0].type).toBe('XLM');
  });

  it('applies status filter', async () => {
    await service.getTransactions({ page: 1, limit: 10, status: 'PENDING' });
    expect(prisma.donation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });

  it('applies date range filter', async () => {
    await service.getTransactions({
      page: 1,
      limit: 10,
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    const callArg = prisma.donation.count.mock.calls[0][0];
    expect(callArg.where.donatedAt.gte).toEqual(new Date('2026-01-01'));
    expect(callArg.where.donatedAt.lte).toEqual(new Date('2026-01-31'));
  });

  it('applies type filter via assetCode', async () => {
    await service.getTransactions({ page: 1, limit: 10, type: 'USDC' });
    expect(prisma.donation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assetCode: { equals: 'USDC', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('calculates correct skip for page 2', async () => {
    await service.getTransactions({ page: 2, limit: 5 });
    expect(prisma.donation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
  });

  it('returns empty data array when no transactions', async () => {
    // @ts-ignore
    service = new TransactionsService(buildPrisma([], 0));
    const result = await service.getTransactions({ page: 1, limit: 10 });
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('defaults to descending donatedAt when sort param is omitted', async () => {
    await service.getTransactions({ page: 1, limit: 10 });
    expect(prisma.donation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { donatedAt: 'desc' } }),
    );
  });

  it('sorts ascending when sort param has no leading dash', async () => {
    await service.getTransactions({ page: 1, limit: 10, sort: 'donatedAt' });
    expect(prisma.donation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { donatedAt: 'asc' } }),
    );
  });

  it('sorts descending when sort param has a leading dash', async () => {
    await service.getTransactions({ page: 1, limit: 10, sort: '-createdAt' });
    expect(prisma.donation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('sorts ascending on createdAt when sort=createdAt', async () => {
    await service.getTransactions({ page: 1, limit: 10, sort: 'createdAt' });
    expect(prisma.donation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    );
  });
});
