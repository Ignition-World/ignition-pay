import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GetTransactionsQueryDto,
  GetTransactionsResponseDto,
  SubmitTransactionDto,
  TransactionDto,
} from './dto/get-transactions.dto';
import { WalletNetwork } from '../wallets/dto/create-wallet.dto';
import {
  isValidNetworkAddress,
  isValidNetworkIssuer,
} from '../wallets/network-address.validator';

const NETWORK_FEES: Record<WalletNetwork, { amount: string; asset: string }> = {
  [WalletNetwork.STELLAR]: { amount: '0.0000100', asset: 'XLM' },
  [WalletNetwork.ETHEREUM]: { amount: '0.0001000', asset: 'ETH' },
  [WalletNetwork.BITCOIN]: { amount: '0.0000100', asset: 'BTC' },
};

// ---------------------------------------------------------------------------
// Cursor helpers
// Cursor is an opaque base64-encoded string that wraps the internal record id.
// This satisfies the requirement: "Cursor is opaque (not exposed internal IDs)".
// ---------------------------------------------------------------------------

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64');
}

function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, 'base64').toString('utf8');
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTransactions(
    query: GetTransactionsQueryDto,
  ): Promise<GetTransactionsResponseDto> {
    const { cursor, limit, dateFrom, dateTo, status, type, asset, search } =
      query;

    // ── Build the WHERE clause ──────────────────────────────────────────────

    const where: Prisma.TransactionWhereInput = {};

    if (status) where.status = status as any;

    // `type` was historically mapped to assetCode; `asset` is the new explicit
    // filter. When both are provided, `asset` wins.
    const assetFilter = asset ?? type;
    if (assetFilter) {
      where.assetCode = { equals: assetFilter, mode: 'insensitive' };
    }

    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    // Free-text search: match on txHash (exact, case-insensitive) or
    // counterparty wallet address (partial).
    if (search) {
      where.OR = [
        { stellarTxHash: { equals: search, mode: 'insensitive' } },
        { fromWalletId: { contains: search, mode: 'insensitive' } },
        { toWalletId: { contains: search, mode: 'insensitive' } },
      ];
    }

    // ── Cursor seek ─────────────────────────────────────────────────────────
    // Decode the opaque cursor to recover the internal id, then look up the
    // (createdAt, id) values for that row so we can do a compound seek that
    // remains stable under concurrent inserts.

    if (cursor) {
      const internalId = decodeCursor(cursor);

      const cursorRow = await this.prisma.transaction.findUnique({
        where: { id: internalId },
        select: { createdAt: true, id: true },
      });

      if (cursorRow) {
        where.AND = [
          ...(where.AND
            ? Array.isArray(where.AND)
              ? where.AND
              : [where.AND]
            : []),
          {
            OR: [
              { createdAt: { lt: cursorRow.createdAt } },
              {
                createdAt: { equals: cursorRow.createdAt },
                id: { lt: cursorRow.id },
              },
            ],
          },
        ];
      }
    }

    // ── Fetch limit+1 rows to detect the next page ──────────────────────────

    const rows = await this.prisma.transaction.findMany({
      where,
      select: {
        id: true,
        fromWalletId: true,
        toWalletId: true,
        amount: true,
        assetCode: true,
        assetIssuer: true,
        metadata: true,
        feeAmount: true,
        feeAssetCode: true,
        stellarTxHash: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Encode the cursor from the last row's internal id so the caller never
    // sees the raw database id.
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1]!.id)
        : null;

    const data: TransactionDto[] = page.map((t) => ({
      id: t.id,
      fromWalletId: t.fromWalletId,
      toWalletId: t.toWalletId,
      // Return amount as string to preserve Decimal(20,7) precision (#409).
      amount: t.amount.toString(),
      assetCode: t.assetCode,
      assetIssuer: t.assetIssuer ?? null,
      network: (t.metadata as { network?: WalletNetwork } | null)?.network,
      feeAmount: t.feeAmount?.toString() ?? '0',
      feeAssetCode: t.feeAssetCode,
      stellarTxHash: t.stellarTxHash ?? null,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return { data, nextCursor, hasMore, limit };
  }

  /**
   * Issue #244 — Idempotent transaction submission.
   */
  async submitTransaction(
    dto: SubmitTransactionDto,
  ): Promise<TransactionDto & { alreadyExisted: boolean }> {
    if (!dto.fromWalletId || !dto.toWalletId) {
      throw new BadRequestException(
        'Both fromWalletId and toWalletId are required',
      );
    }

    const network = dto.network ?? WalletNetwork.STELLAR;
    const fee = NETWORK_FEES[network];
    const assetCode = (dto.assetCode ?? fee.asset).toUpperCase();
    const [fromWallet, toWallet] = await Promise.all([
      this.prisma.wallet?.findUnique?.({ where: { id: dto.fromWalletId } }),
      this.prisma.wallet?.findUnique?.({ where: { id: dto.toWalletId } }),
    ]);

    for (const wallet of [fromWallet, toWallet].filter(Boolean)) {
      if (wallet.network !== network) {
        throw new BadRequestException(
          `Wallet ${wallet.id} does not belong to the ${network} network`,
        );
      }
      if (!isValidNetworkAddress(wallet.depositAddress, network)) {
        throw new BadRequestException(`Invalid ${network} wallet address`);
      }
    }

    if (network === WalletNetwork.STELLAR) {
      if (assetCode === 'XLM' && dto.assetIssuer) {
        throw new BadRequestException('XLM must not have an asset issuer');
      }
      if (assetCode !== 'XLM' && (!dto.assetIssuer || !isValidNetworkIssuer(dto.assetIssuer, network))) {
        throw new BadRequestException('A valid Stellar asset issuer is required for non-XLM assets');
      }
    } else {
      const nativeAsset = fee.asset;
      if (assetCode !== nativeAsset || dto.assetIssuer) {
        throw new BadRequestException(`${network} transactions must use ${nativeAsset} without an asset issuer`);
      }
    }

    // Idempotency check: if we already have a record with this hash, return it.
    if (dto.stellarTxHash) {
      const existing = await this.prisma.transaction.findUnique({
        where: { stellarTxHash: dto.stellarTxHash },
      });
      if (existing) {
        return {
          id: existing.id,
          fromWalletId: existing.fromWalletId,
          toWalletId: existing.toWalletId,
          amount: existing.amount.toString(),
          assetCode: existing.assetCode,
          assetIssuer: existing.assetIssuer ?? null,
          network: (existing.metadata as { network?: WalletNetwork } | null)?.network,
          feeAmount: existing.feeAmount?.toString() ?? '0',
          feeAssetCode: existing.feeAssetCode,
          stellarTxHash: existing.stellarTxHash ?? null,
          status: existing.status,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          alreadyExisted: true,
        };
      }
    }

    try {
      const created = await this.prisma.transaction.create({
        data: {
          fromWalletId: dto.fromWalletId,
          toWalletId: dto.toWalletId,
          amount: dto.amount,
          assetCode,
          assetIssuer: dto.assetIssuer ?? null,
          feeAmount: fee.amount,
          feeAssetCode: fee.asset,
          stellarTxHash: dto.stellarTxHash ?? null,
          status: 'PENDING',
          metadata: { network },
        },
      });

      return {
        id: created.id,
        fromWalletId: created.fromWalletId,
        toWalletId: created.toWalletId,
        amount: created.amount.toString(),
        assetCode: created.assetCode,
        assetIssuer: created.assetIssuer ?? null,
        network,
        feeAmount: created.feeAmount?.toString() ?? fee.amount,
        feeAssetCode: created.feeAssetCode ?? fee.asset,
        stellarTxHash: created.stellarTxHash ?? null,
        status: created.status,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        alreadyExisted: false,
      };
    } catch (err: any) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        dto.stellarTxHash
      ) {
        const existing = await this.prisma.transaction.findUnique({
          where: { stellarTxHash: dto.stellarTxHash },
        });
        if (existing) {
          return {
            id: existing.id,
            fromWalletId: existing.fromWalletId,
            toWalletId: existing.toWalletId,
            amount: existing.amount.toString(),
            assetCode: existing.assetCode,
            assetIssuer: existing.assetIssuer ?? null,
            network: (existing.metadata as { network?: WalletNetwork } | null)?.network,
            feeAmount: existing.feeAmount?.toString() ?? '0',
            feeAssetCode: existing.feeAssetCode,
            stellarTxHash: existing.stellarTxHash ?? null,
            status: existing.status,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
            alreadyExisted: true,
          };
        }
        throw new ConflictException(
          'A transaction with this Stellar tx hash already exists',
        );
      }
      throw err;
    }
  }
}
