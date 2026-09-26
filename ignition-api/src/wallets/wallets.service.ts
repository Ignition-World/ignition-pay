import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import StellarSdk, { StrKey } from '@stellar/stellar-sdk';
import { ConfigService } from '@nestjs/config';
import Keyv from 'keyv';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWalletDto, WalletNetwork } from './dto/create-wallet.dto';
import { WalletStatus, WalletType } from '@prisma/client';
import { WalletLimitService } from '../wallet/services/wallet-limit.service';
import { generateNetworkAddress, isValidNetworkAddress } from './network-address.validator';

@Injectable()
export class WalletsService {
  private horizonUrl: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Keyv,
    private readonly prisma: PrismaService,
    private readonly walletLimitService: WalletLimitService,
  ) {
    this.horizonUrl =
      this.config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';
  }

  /**
   * Create a new wallet for a user, assigning a deposit address and configuring limits.
   */
  async createWallet(userId: string, dto: CreateWalletDto) {
    // Verify user exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const network = dto.network ?? WalletNetwork.STELLAR;
    const walletType = dto.walletType ?? WalletType.CUSTODIAL;
    const limits = this.walletLimitService.resolveCreationLimits(dto);

    // NON_CUSTODIAL: user must supply their own public key / deposit address;
    // the server never generates or stores a secret key.
    if (walletType === WalletType.NON_CUSTODIAL && !dto.depositAddress) {
      throw new BadRequestException(
        'depositAddress is required for NON_CUSTODIAL wallets',
      );
    }

    // CUSTODIAL: auto-generate a keypair when no address is supplied.
    // NON_CUSTODIAL: only the user-provided public address is stored.
    if (network !== WalletNetwork.STELLAR && !dto.depositAddress) {
      throw new BadRequestException(
        `depositAddress is required for ${network} wallets`,
      );
    }

    const depositAddress = dto.depositAddress ?? generateNetworkAddress(network);

    if (!isValidNetworkAddress(depositAddress, network)) {
      throw new BadRequestException(`Invalid ${network} deposit address`);
    }

    // Ensure deposit address is not already in use
    const existing = await this.prisma.wallet.findUnique({
      where: { depositAddress },
    });
    if (existing) {
      throw new ConflictException(
        'Deposit address already assigned to another wallet',
      );
    }

    const wallet = await this.prisma.wallet.create({
      data: {
        userId,
        network,
        depositAddress,
        walletType,
        label: dto.label ?? null,
        dailyLimit: limits.dailyLimit,
        monthlyLimit: limits.monthlyLimit,
      },
    });

    return this.formatWalletResponse(wallet);
  }

  /**
   * Get all active wallets for a user (filters out soft-deleted wallets by default).
   */
  async getWalletsByUser(userId: string, includeDeleted = false) {
    const wallets = await this.prisma.wallet.findMany({
      where: {
        userId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return wallets.map((w) => this.formatWalletResponse(w));
  }

  /**
   * Get a wallet by ID with soft-delete filtering and ownership verification.
   */
  async getWalletById(id: string, userId?: string, includeDeleted = false) {
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (userId && wallet.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this wallet',
      );
    }

    return this.formatWalletResponse(wallet);
  }

  /**
   * Soft-delete a wallet (Issue #424).
   * Sets deletedAt, isActive=false, status=CLOSED without cascading or losing
   * transaction history needed for tax and balance reconciliation.
   */
  async deleteWallet(id: string, userId?: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id, deletedAt: null },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (userId && wallet.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this wallet',
      );
    }

    const deleted = await this.prisma.wallet.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        status: WalletStatus.CLOSED,
      },
    });

    await this.cacheManager.delete(`balance:${wallet.depositAddress}`);

    return {
      success: true,
      message: 'Wallet deleted successfully',
      id: deleted.id,
      deletedAt: deleted.deletedAt,
    };
  }

  /**
   * Restore a previously soft-deleted wallet.
   */
  async restoreWallet(id: string, userId?: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (!wallet.deletedAt) {
      throw new BadRequestException('Wallet is not deleted');
    }

    if (userId && wallet.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to restore this wallet',
      );
    }

    const restored = await this.prisma.wallet.update({
      where: { id },
      data: {
        deletedAt: null,
        isActive: true,
        status: WalletStatus.ACTIVE,
      },
    });

    return {
      success: true,
      message: 'Wallet restored successfully',
      id: restored.id,
    };
  }

  /**
   * Get current balances and recent transaction summary for a Stellar account.
   */
  async getBalanceAndRecentTransactions(walletAddress: string) {
    if (!walletAddress || !StrKey.isValidEd25519PublicKey(walletAddress)) {
      throw new BadRequestException('Invalid Stellar wallet address');
    }

    // Check if the wallet is soft-deleted
    const wallet = await this.prisma.wallet.findUnique({
      where: { depositAddress: walletAddress },
    });
    if (wallet && wallet.deletedAt) {
      throw new NotFoundException('Wallet not found');
    }

    const cacheKey = `balance:${walletAddress}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const server = new StellarSdk.Server(this.horizonUrl);

    // Fetch account info
    const account = await server.accounts().accountId(walletAddress).call();

    const balances = (account.balances || []).map((b: any) => ({
      assetType: b.asset_type,
      assetCode:
        b.asset_code ?? (b.asset_type === 'native' ? 'XLM' : undefined),
      balance: b.balance,
    }));

    // Fetch recent payments (as a lightweight transaction summary)
    const payments = await server
      .payments()
      .forAccount(walletAddress)
      .order('desc')
      .limit(5)
      .call();

    const recentTransactions = (payments.records || []).map((r: any) => ({
      id: r.id ?? r.transaction_hash,
      type: r.type,
      from: r.from,
      to: r.to,
      amount: r.amount,
      assetCode:
        r.asset_code ?? (r.asset_type === 'native' ? 'XLM' : undefined),
      createdAt: r.created_at,
    }));

    const result = { balances, recentTransactions };

    // Cache result; TTL configurable in seconds (default 30s)
    const ttlSec = Number(
      this.config.get<number>('BALANCE_CACHE_TTL_SEC') ?? 30,
    );
    // Keyv expects ttl in milliseconds
    await this.cacheManager.set(cacheKey, result, ttlSec * 1000);

    return result;
  }

  private formatWalletResponse(wallet: any) {
    return {
      id: wallet.id,
      userId: wallet.userId,
      network: wallet.network,
      depositAddress: wallet.depositAddress,
      walletType: wallet.walletType,
      status: wallet.status,
      label: wallet.label,
      dailyLimit: Number(wallet.dailyLimit),
      monthlyLimit: Number(wallet.monthlyLimit),
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
      deletedAt: wallet.deletedAt ?? undefined,
    };
  }
}
