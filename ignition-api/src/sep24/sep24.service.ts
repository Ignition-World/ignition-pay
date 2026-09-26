import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  InitiateSep24Dto,
  Sep24Operation,
  GetSep24HistoryQueryDto,
} from './dto/initiate-sep24.dto';
import type {
  Sep24HistoryItemDto,
  Sep24HistoryResponseDto,
} from './dto/sep24-response.dto';

const ANCHOR_CONFIGS: Record<string, { domain: string; sep10?: string }> = {
  StellarX: { domain: 'https://api.stellarx.com' },
  AnchorUSD: { domain: 'https://api.anchorusd.com' },
  GateHub: { domain: 'https://api.gatehub.com' },
  PayMunk: { domain: 'https://api.paymunk.com' },
};

const SEP_24_DEPOSIT_STATUSES = [
  'incomplete',
  'pending_user_transfer_start',
  'pending_external',
  'pending_anchor',
  'pending_stellar',
  'pending_trust',
  'pending_user',
  'completed',
  'no_market',
  'too_small',
  'too_large',
  'expired',
  'error',
] as const;

function isValidSep24Status(status: string): boolean {
  return SEP_24_DEPOSIT_STATUSES.includes(status as any);
}

@Injectable()
export class Sep24Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Issue #427 — Build the async callback URL the anchor will POST status
   * updates to. Returns null when PUBLIC_BASE_URL is not configured, in
   * which case the flow falls back to synchronous polling (see getStatus).
   */
  private buildCallbackUrl(token: string): string | null {
    const base = this.config.get<string>('PUBLIC_BASE_URL', '')?.trim();
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/sep24/callback/${token}`;
  }

  /**
   * Issue #427 — opaque per-transaction secret used to authenticate the
   * unauthenticated webhook callback (anchors cannot present a JWT).
   */
  private generateCallbackToken(): string {
    return randomBytes(32).toString('hex');
  }

  private getAnchorConfig(anchorName: string): { domain: string } {
    const config = ANCHOR_CONFIGS[anchorName];
    if (!config) {
      throw new NotFoundException(`Unknown anchor: ${anchorName}`);
    }
    return config;
  }

  async initiate(
    req: InitiateSep24Dto,
    userId: string,
  ): Promise<{
    id: string;
    anchorTxId: string;
    interactiveUrl: string;
    status: string;
    statusDesc?: string;
    moreInfoUrl?: string;
    startedAt: Date;
  }> {
    const config = this.getAnchorConfig(req.anchorName);

    const transactionId = req.transactionId ?? req.transaction_id;
    let existingRecord: any = null;

    if (transactionId) {
      existingRecord = await this.prisma.sep24Transaction.findFirst({
        where: {
          OR: [{ id: transactionId }, { anchorTxId: transactionId }],
        },
      });

      if (!existingRecord) {
        throw new NotFoundException('SEP-24 transaction not found');
      }

      // Issue #425 — Ensure authenticated caller owns the transaction before returning interactive URL
      if (existingRecord.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to access this transaction',
        );
      }

      if (
        existingRecord.anchorName !== req.anchorName ||
        existingRecord.operation !== req.operation
      ) {
        throw new BadRequestException(
          'Transaction operation or anchor mismatch',
        );
      }
    }

    const endpoint =
      req.operation === Sep24Operation.DEPOSIT
        ? '/transactions/deposit/interactive'
        : '/transactions/withdraw/interactive';

    const callbackToken =
      existingRecord?.callbackToken ?? this.generateCallbackToken();
    const callbackUrl = this.buildCallbackUrl(callbackToken);

    const body: Record<string, any> = {
      asset_code: req.assetCode,
      account: req.stellarAccount,
    };
    if (req.assetIssuer) body.asset_issuer = req.assetIssuer;
    if (req.amount != null) body.amount = req.amount.toString();
    if (transactionId) {
      body.transaction_id = existingRecord?.anchorTxId ?? transactionId;
    }
    // Issue #427 — give the anchor our webhook so it can push status updates
    // asynchronously instead of relying on the client to long-poll it.
    if (callbackUrl) body.callback = callbackUrl;

    const url = `${config.domain}${endpoint}`;

    let anchorResponse: any;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new BadRequestException(
          `Anchor returned ${response.status}: ${errorText}`,
        );
      }
      anchorResponse = await response.json();
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      // If the real anchor is unreachable, simulate a response for development
      anchorResponse = this.simulateAnchorResponse(
        req,
        config.domain,
        existingRecord?.anchorTxId ?? transactionId,
      );
    }

    const anchorTxId: string =
      anchorResponse.id ?? existingRecord?.anchorTxId ?? `sim-${Date.now()}`;
    const interactiveUrl: string =
      anchorResponse.url ?? `${config.domain}/sep24/interactive/${anchorTxId}`;

    if (existingRecord) {
      const updated = await this.prisma.sep24Transaction.update({
        where: { id: existingRecord.id },
        data: {
          anchorTxId,
          interactiveUrl,
          rawAnchorResponse: anchorResponse,
          status:
            anchorResponse.status && isValidSep24Status(anchorResponse.status)
              ? anchorResponse.status
              : existingRecord.status,
          statusDesc:
            anchorResponse.statusDescription ?? existingRecord.statusDesc,
          moreInfoUrl:
            anchorResponse.more_info_url ?? existingRecord.moreInfoUrl,
        },
      });

      return {
        id: updated.id,
        anchorTxId,
        interactiveUrl,
        status: updated.status,
        statusDesc:
          anchorResponse.statusDescription ??
          updated.statusDesc ??
          'Awaiting user interaction with the anchor',
        moreInfoUrl:
          anchorResponse.more_info_url ?? updated.moreInfoUrl ?? undefined,
        startedAt: updated.startedAt,
      };
    }

    const record = await this.prisma.sep24Transaction.create({
      data: {
        userId,
        anchorName: req.anchorName,
        operation: req.operation,
        stellarAccount: req.stellarAccount,
        assetCode: req.assetCode,
        assetIssuer: req.assetIssuer ?? null,
        amount: req.amount != null ? req.amount : null,
        anchorTxId,
        interactiveUrl,
        callbackToken,
        status: 'incomplete',
        rawAnchorResponse: anchorResponse,
      },
    });

    return {
      id: record.id,
      anchorTxId,
      interactiveUrl,
      status: 'incomplete',
      statusDesc: 'Awaiting user interaction with the anchor',
      startedAt: record.startedAt,
    };
  }

  async getStatus(
    txId: string,
    userId?: string,
  ): Promise<{
    id: string;
    anchorTxId: string;
    status: string;
    statusDesc?: string;
    moreInfoUrl?: string;
    stellarTxHash?: string;
    externalTxId?: string;
    message?: string;
    amountIn?: string;
    amountOut?: string;
    feeDetails?: Record<string, unknown>;
    startedAt: Date;
    completedAt?: Date;
  }> {
    const record = await this.prisma.sep24Transaction.findUnique({
      where: { id: txId },
    });
    if (!record) {
      throw new NotFoundException('SEP-24 transaction not found');
    }

    // Issue #425 — Validate transaction ownership if userId is provided
    if (userId && record.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this transaction',
      );
    }

    const config = this.getAnchorConfig(record.anchorName);

    // Issue #427 — when async callbacks are flowing, the locally stored
    // status is the source of truth and we must NOT block on a synchronous
    // anchor poll (which is what previously timed out under long-polling).
    // We only fall back to the blocking poll when no webhook has ever
    // arrived for this transaction (e.g. dev simulation / legacy anchors).
    const asyncTrackingActive = record.lastCallbackAt != null;

    let anchorStatus: any;
    if (!asyncTrackingActive) {
      try {
        const response = await fetch(
          `${config.domain}/transactions/${record.anchorTxId}`,
          { headers: { Accept: 'application/json' } },
        );
        if (response.ok) {
          const data = await response.json();
          anchorStatus = data.transaction ?? data;
        }
      } catch {
        // Simulate status progression for development
        anchorStatus = this.simulateStatusUpdate(record);
      }
    }

    const status = anchorStatus?.status ?? record.status;
    const normalizedStatus = isValidSep24Status(status)
      ? status
      : record.status;

    if (anchorStatus && normalizedStatus !== record.status) {
      const updateData: any = { status: normalizedStatus };
      if (normalizedStatus === 'completed') {
        updateData.completedAt = new Date();
      }
      if (anchorStatus?.stellar_transaction_hash) {
        updateData.stellarTxHash = anchorStatus.stellar_transaction_hash;
      }
      if (anchorStatus?.more_info_url) {
        updateData.moreInfoUrl = anchorStatus.more_info_url;
      }
      if (anchorStatus?.message) {
        updateData.message = anchorStatus.message;
      }
      await this.prisma.sep24Transaction.update({
        where: { id: txId },
        data: {
          ...updateData,
          rawAnchorResponse: anchorStatus,
        },
      });
    }

    // When async tracking is active, anchorStatus is null; fall back to the
    // last webhook payload (rawAnchorResponse) so amounts/fees/etc. that the
    // anchor only sends via the callback are still surfaced.
    const src: any = anchorStatus ?? record.rawAnchorResponse ?? {};

    return {
      id: record.id,
      anchorTxId: record.anchorTxId!,
      status: normalizedStatus,
      statusDesc: src.statusDescription ?? record.statusDesc ?? undefined,
      moreInfoUrl: src.more_info_url ?? record.moreInfoUrl ?? undefined,
      stellarTxHash:
        src.stellar_transaction_hash ?? record.stellarTxHash ?? undefined,
      externalTxId: src.external_transaction_id ?? undefined,
      message: src.message ?? record.message ?? undefined,
      amountIn:
        src.amount_in != null
          ? src.amount_in.toString()
          : record.amount?.toString(),
      amountOut: src.amount_out != null ? src.amount_out.toString() : undefined,
      feeDetails: src.fee_details ?? undefined,
      startedAt: record.startedAt,
      completedAt: record.completedAt ?? undefined,
    };
  }

  async findById(
    id: string,
    userId?: string,
  ): Promise<{ anchorName: string; anchorTxId: string }> {
    const record = await this.prisma.sep24Transaction.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException('SEP-24 transaction not found');
    }
    // Issue #425 — Validate transaction ownership if userId is provided
    if (userId && record.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this transaction',
      );
    }
    return { anchorName: record.anchorName, anchorTxId: record.anchorTxId! };
  }

  /**
   * Issue #427 — Async status tracking.
   *
   * The anchor POSTs SEP-24 transaction updates to the callback URL
   * registered during `initiate`. The opaque `callbackToken` in the URL
   * path authenticates the otherwise-unauthenticated webhook; the anchor
   * echoes its own transaction `id` in the body, which we cross-check
   * against the stored `anchorTxId` before applying the update.
   *
   * Updates are applied asynchronously and never block the client's
   * polling of `getStatus`.
   */
  async handleCallback(
    token: string,
    payload: Record<string, any>,
  ): Promise<void> {
    const record = await this.prisma.sep24Transaction.findUnique({
      where: { callbackToken: token },
    });
    if (!record) {
      throw new NotFoundException('Unknown SEP-24 callback token');
    }

    // The anchor's reported transaction id must match what we stored.
    const reportedId = payload?.id ?? payload?.transaction?.id;
    if (reportedId && record.anchorTxId && reportedId !== record.anchorTxId) {
      throw new BadRequestException('Callback transaction id mismatch');
    }

    const status = payload?.status ?? payload?.transaction?.status;
    const normalizedStatus =
      status && isValidSep24Status(status) ? status : record.status;

    const updateData: any = {
      lastCallbackAt: new Date(),
    };
    if (normalizedStatus !== record.status) {
      updateData.status = normalizedStatus;
      if (normalizedStatus === 'completed') {
        updateData.completedAt = new Date();
      }
    }

    const tx = payload?.transaction ?? payload;
    if (tx?.stellar_transaction_hash) {
      updateData.stellarTxHash = tx.stellar_transaction_hash;
    }
    if (tx?.more_info_url) {
      updateData.moreInfoUrl = tx.more_info_url;
    }
    if (tx?.message) {
      updateData.message = tx.message;
    }
    if (tx?.status_eta != null) {
      updateData.statusDesc = `Estimated ${tx.status_eta}s to ${normalizedStatus}`;
    } else if (tx?.statusDescription) {
      updateData.statusDesc = tx.statusDescription;
    }
    // amount_in/out, fee_details and external_transaction_id are not stored
    // as dedicated columns; they are preserved in rawAnchorResponse and
    // surfaced by getStatus.

    await this.prisma.sep24Transaction.update({
      where: { id: record.id },
      data: { ...updateData, rawAnchorResponse: payload },
    });
  }

  async getHistory(
    userId: string,
    query: GetSep24HistoryQueryDto,
  ): Promise<Sep24HistoryResponseDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Record<string, any> = { userId };
    if (query.operation) where.operation = query.operation;
    if (query.anchorName) where.anchorName = query.anchorName;

    const [records, total] = await Promise.all([
      this.prisma.sep24Transaction.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          anchorName: true,
          operation: true,
          assetCode: true,
          assetIssuer: true,
          amount: true,
          status: true,
          statusDesc: true,
          anchorTxId: true,
          stellarTxHash: true,
          moreInfoUrl: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      this.prisma.sep24Transaction.count({ where }),
    ]);

    const items: Sep24HistoryItemDto[] = records.map((r) => ({
      id: r.id,
      anchorName: r.anchorName,
      operation: r.operation as 'deposit' | 'withdraw',
      assetCode: r.assetCode,
      assetIssuer: r.assetIssuer ?? undefined,
      amount: r.amount != null ? r.amount.toString() : undefined,
      status: r.status,
      statusDesc: r.statusDesc ?? undefined,
      anchorTxId: r.anchorTxId ?? undefined,
      stellarTxHash: r.stellarTxHash ?? undefined,
      moreInfoUrl: r.moreInfoUrl ?? undefined,
      startedAt: r.startedAt,
      completedAt: r.completedAt ?? undefined,
    }));

    return { items, total, page, limit };
  }

  private simulateAnchorResponse(
    req: InitiateSep24Dto,
    _domain: string,
    existingTxId?: string,
  ): any {
    const txId = existingTxId ?? `sim-${Date.now()}`;
    return {
      id: txId,
      url: `/sep24/interactive-simulator?txId=${txId}&operation=${req.operation}&asset=${req.assetCode}`,
      status: 'incomplete',
      statusDescription: existingTxId
        ? 'Interactive flow resumed'
        : 'Interactive flow initiated',
    };
  }

  private simulateStatusUpdate(record: any): any {
    const elapsed = Date.now() - new Date(record.startedAt).getTime();
    const minutes = elapsed / 60000;

    if (minutes < 1) {
      return {
        status: 'incomplete',
        statusDescription: 'User is completing the interactive flow',
      };
    }
    if (minutes < 2) {
      return {
        status: 'pending_anchor',
        statusDescription: 'Anchor is processing the transaction',
      };
    }
    if (minutes < 3) {
      return {
        status: 'pending_stellar',
        statusDescription: 'Stellar transaction is being submitted',
      };
    }
    return {
      status: 'completed',
      statusDescription: 'Transaction completed successfully',
      stellar_transaction_hash: `sim-${record.anchorTxId}-txhash`,
      amount_in: record.amount?.toString(),
      amount_out: record.amount?.toString(),
      fee_details: { total: '0.00001', asset: 'XLM' },
    };
  }
}
