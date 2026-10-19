import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Sep38Service } from './sep38.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeQuote = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'quote-uuid-1',
  userId: 'user-uuid-1',
  sellAsset: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  buyAsset: 'iso4217:USD',
  sellAmount: new Prisma.Decimal('100.0000000'),
  // Sub-cent precision that would be silently rounded by a Float column
  price: new Prisma.Decimal('0.00000000123'),
  expiresAt: new Date('2026-10-20T10:00:00.000Z'),
  createdAt: new Date('2026-10-19T09:00:00.000Z'),
  updatedAt: new Date('2026-10-19T09:00:00.000Z'),
  ...overrides,
});

const buildPrisma = (stored: ReturnType<typeof makeQuote> | null = makeQuote()) => ({
  sep38Quote: {
    create: jest.fn().mockResolvedValue(stored),
    findUnique: jest.fn().mockResolvedValue(stored),
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sep38Service', () => {
  let service: Sep38Service;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    // @ts-ignore — inject mock prisma
    service = new Sep38Service(prisma);
  });

  // -------------------------------------------------------------------------
  // createQuote
  // -------------------------------------------------------------------------

  describe('createQuote', () => {
    const validDto = {
      sellAsset:
        'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      buyAsset: 'iso4217:USD',
      sellAmount: '100.0000000',
      price: '0.00000000123',
      expiresAt: '2026-10-20T10:00:00.000Z',
    };

    it('creates a quote and returns a QuoteResponseDto', async () => {
      const result = await service.createQuote('user-uuid-1', validDto);
      expect(result.id).toBe('quote-uuid-1');
      expect(result.userId).toBe('user-uuid-1');
      expect(result.sellAsset).toBe(validDto.sellAsset);
      expect(result.buyAsset).toBe(validDto.buyAsset);
    });

    it('persists price via Prisma.Decimal — no JS Number conversion', async () => {
      await service.createQuote('user-uuid-1', validDto);
      const createCall = prisma.sep38Quote.create.mock.calls[0][0];
      // The price field passed to Prisma must be a Prisma.Decimal instance,
      // not a plain JS number, to guarantee full precision is preserved.
      expect(createCall.data.price).toBeInstanceOf(Prisma.Decimal);
      expect(createCall.data.sellAmount).toBeInstanceOf(Prisma.Decimal);
    });

    it('preserves sub-cent precision in the response — price is returned as a string', async () => {
      const result = await service.createQuote('user-uuid-1', validDto);
      // The response must be a string, not a JS number, so that callers never
      // lose precision through a Number round-trip.
      expect(typeof result.price).toBe('string');
      // Decimal.toFixed() returns full precision without scientific notation.
      expect(result.price).toBe('0.00000000123');
    });

    it('sellAmount is returned as a string with full precision', async () => {
      const result = await service.createQuote('user-uuid-1', validDto);
      expect(typeof result.sellAmount).toBe('string');
      expect(result.sellAmount).toBe('100.0000000');
    });

    it('throws BadRequestException for a zero price', async () => {
      await expect(
        service.createQuote('user-uuid-1', { ...validDto, price: '0' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a negative price', async () => {
      await expect(
        service.createQuote('user-uuid-1', { ...validDto, price: '-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a non-numeric price', async () => {
      await expect(
        service.createQuote('user-uuid-1', { ...validDto, price: 'not-a-number' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a zero sellAmount', async () => {
      await expect(
        service.createQuote('user-uuid-1', { ...validDto, sellAmount: '0' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a negative sellAmount', async () => {
      await expect(
        service.createQuote('user-uuid-1', { ...validDto, sellAmount: '-50' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // getQuote
  // -------------------------------------------------------------------------

  describe('getQuote', () => {
    it('returns the quote when userId matches', async () => {
      const result = await service.getQuote('user-uuid-1', 'quote-uuid-1');
      expect(result.id).toBe('quote-uuid-1');
      expect(result.userId).toBe('user-uuid-1');
    });

    it('returns price as a full-precision string', async () => {
      const result = await service.getQuote('user-uuid-1', 'quote-uuid-1');
      expect(result.price).toBe('0.00000000123');
    });

    it('throws NotFoundException when the quote does not exist', async () => {
      // @ts-ignore
      service = new Sep38Service(buildPrisma(null));
      await expect(
        service.getQuote('user-uuid-1', 'missing-quote'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the quote belongs to a different user', async () => {
      // findUnique returns a quote owned by user-uuid-1
      await expect(
        service.getQuote('different-user', 'quote-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
