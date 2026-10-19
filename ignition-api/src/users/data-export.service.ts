import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';

import { PrismaService } from '../prisma/prisma.service';

/** Download links are valid for 24 hours (issue #619). */
export const EXPORT_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** Default HMAC secret used when DATA_EXPORT_HMAC_SECRET is not configured. */
const DEFAULT_HMAC_SECRET = 'ignition-pay-data-export';

export interface DataExportArtifact {
  /** Opaque token used to download the export. */
  token: string;
  /** Absolute expiry timestamp of the download link. */
  expiresAt: Date;
  /** HMAC signature over the gzipped payload (hex). */
  signature: string;
  /** Gzipped JSON payload. */
  payload: Buffer;
}

interface StoredExport {
  userId: string;
  payload: Buffer;
  signature: string;
  expiresAt: Date;
}

/**
 * GDPR data export (issue #619).
 *
 * Collects every record associated with a user, strips secrets (password
 * hashes, API key hashes, token secrets), gzips the JSON document and signs
 * it with HMAC-SHA256 so the recipient can verify integrity. Artifacts are
 * held in memory and expire after 24 hours.
 */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);
  private readonly store = new Map<string, StoredExport>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get hmacSecret(): string {
    return (
      this.config.get<string>('DATA_EXPORT_HMAC_SECRET') ?? DEFAULT_HMAC_SECRET
    );
  }

  /** Mask a secret, keeping only the last 4 characters. */
  static maskSecret(value: string | null | undefined): string | null {
    if (!value) return null;
    if (value.length <= 4) return '****';
    return `****${value.slice(-4)}`;
  }

  /**
   * Build the export document for a user. Never includes password hashes,
   * API key hashes or token secrets.
   */
  async buildExport(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        wallets: true,
        donations: true,
        notifications: true,
        auditLogs: true,
        apiKeys: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const {
      passwordHash: _passwordHash,
      wallets,
      donations,
      notifications,
      auditLogs,
      apiKeys,
      ...profile
    } = user;

    const walletIds = wallets.map((wallet) => wallet.id);

    const transactions = walletIds.length
      ? await this.prisma.transaction.findMany({
          where: {
            OR: [
              { fromWalletId: { in: walletIds } },
              { toWalletId: { in: walletIds } },
            ],
          },
        })
      : [];

    const addresses = walletIds.length
      ? await this.prisma.address.findMany({
          where: { walletId: { in: walletIds } },
        })
      : [];

    return {
      exportedAt: new Date().toISOString(),
      userId,
      profile,
      wallets,
      addresses,
      transactions,
      donations,
      notifications,
      auditLogs,
      // API keys are masked: only the last 4 characters of the prefix are kept.
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: DataExportService.maskSecret(key.prefix),
        scope: key.scope,
        isActive: key.isActive,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      })),
    };
  }

  /** Gzip + HMAC-sign the export document and register a 24h download token. */
  async generateExport(userId: string): Promise<DataExportArtifact> {
    const document = await this.buildExport(userId);
    const payload = gzipSync(Buffer.from(JSON.stringify(document), 'utf8'));
    const signature = this.sign(payload);
    const token = this.createToken();
    const expiresAt = new Date(Date.now() + EXPORT_LINK_TTL_MS);

    this.store.set(token, { userId, payload, signature, expiresAt });

    this.logger.log(
      JSON.stringify({
        event: 'data_export_generated',
        userId,
        token,
        expiresAt: expiresAt.toISOString(),
      }),
    );

    return { token, expiresAt, signature, payload };
  }

  /** Retrieve a stored export, enforcing the 24h expiry window. */
  getExport(token: string): StoredExport | null {
    const entry = this.store.get(token);
    if (!entry) return null;

    if (entry.expiresAt.getTime() <= Date.now()) {
      this.store.delete(token);
      return null;
    }

    return entry;
  }

  /** Verify the HMAC signature of a stored export. */
  verify(token: string): boolean {
    const entry = this.getExport(token);
    if (!entry) return false;

    const expected = Buffer.from(this.sign(entry.payload), 'hex');
    const actual = Buffer.from(entry.signature, 'hex');
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }

  /** Decompress a stored export payload back into its JSON document. */
  decode(token: string): Record<string, unknown> | null {
    const entry = this.getExport(token);
    if (!entry) return null;
    return JSON.parse(gunzipSync(entry.payload).toString('utf8'));
  }

  private sign(payload: Buffer): string {
    return createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
  }

  private createToken(): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`${Date.now()}:${Math.random()}`)
      .digest('hex');
  }
}
