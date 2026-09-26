import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressResponseDto } from './dto/address-response.dto';
import StellarSdk, { StrKey } from '@stellar/stellar-sdk';
import { GenerateAddressDto } from './dto/generate-address.dto';
import { WalletNetwork } from '../wallets/dto/create-wallet.dto';
import { VerifyAddressResponseDto } from './dto/verify-address-response.dto';
import { GenerateMemoDto, MemoTypeOption } from './dto/generate-memo.dto';
import { ValidateMemoDto } from './dto/validate-memo.dto';
import { ResolveDepositDto } from './dto/resolve-deposit.dto';
import {
  extractRouting,
  validateMemo as validateStellarMemo,
  generateMemo as generateStellarMemo,
} from 'stellar-address-kit';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAddressDto): Promise<AddressResponseDto> {
    const existing = await this.prisma.address.findUnique({
      where: { address: dto.address },
    });
    if (existing) {
      throw new ConflictException('Address already exists');
    }

    if (dto.walletId) {
      const wallet = await this.prisma.wallet.findFirst({
        where: { id: dto.walletId, isActive: true, deletedAt: null },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }
    }

    const address = await this.prisma.address.create({
      data: {
        address: dto.address,
        network: dto.network ?? 'STELLAR',
        walletId: dto.walletId ?? null,
        label: dto.label ?? null,
        isActive: dto.isActive ?? true,
        allocatedAt: dto.walletId ? new Date() : null,
      },
    });

    return this.toResponse(address);
  }

  async findAll(): Promise<AddressResponseDto[]> {
    const addresses = await this.prisma.address.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return addresses.map(this.toResponse);
  }

  async findOne(id: string): Promise<AddressResponseDto> {
    const address = await this.prisma.address.findUnique({
      where: { id, isActive: true },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return this.toResponse(address);
  }

  async findByAddress(addressStr: string): Promise<AddressResponseDto> {
    const address = await this.prisma.address.findUnique({
      where: { address: addressStr, isActive: true },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return this.toResponse(address);
  }

  async findByWallet(walletId: string): Promise<AddressResponseDto[]> {
    const addresses = await this.prisma.address.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
    });
    return addresses.map(this.toResponse);
  }

  async update(id: string, dto: UpdateAddressDto): Promise<AddressResponseDto> {
    const existing = await this.prisma.address.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Address not found');
    }

    if (dto.walletId) {
      const wallet = await this.prisma.wallet.findFirst({
        where: { id: dto.walletId, isActive: true, deletedAt: null },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }
    }

    const wasUnallocated = !existing.walletId && !!dto.walletId;

    const address = await this.prisma.address.update({
      where: { id },
      data: {
        ...(dto.walletId !== undefined && { walletId: dto.walletId }),
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.network !== undefined && { network: dto.network }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(wasUnallocated && { allocatedAt: new Date() }),
      },
    });

    return this.toResponse(address);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.address.findUnique({
      where: { id, isActive: true },
    });
    if (!existing) {
      throw new NotFoundException('Address not found');
    }

    await this.prisma.address.delete({ where: { id } });
  }

  async touchActivity(id: string): Promise<void> {
    await this.prisma.address.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    });
  }

  private toResponse(address: any): AddressResponseDto {
    return {
      id: address.id,
      walletId: address.walletId ?? undefined,
      address: address.address,
      network: address.network,
      label: address.label ?? undefined,
      isActive: address.isActive,
      allocatedAt: address.allocatedAt ?? undefined,
      lastActivityAt: address.lastActivityAt ?? undefined,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    };
  }

  async generate(userId: string, dto: GenerateAddressDto) {
    const { walletId, network = WalletNetwork.STELLAR, label } = dto;

    const wallet = await this.prisma.wallet.findFirst({
      where: { id: walletId, isActive: true, deletedAt: null },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId)
      throw new NotFoundException('Wallet not found');

    // Re-use an AVAILABLE address for this wallet if one exists, so we don't
    // create unbounded new addresses on repeated calls.
    const reusable = await this.prisma.depositAddress.findFirst({
      where: { walletId, status: 'AVAILABLE' },
      orderBy: { createdAt: 'asc' },
    });

    if (reusable) {
      // Transition back to ALLOCATED and refresh allocatedAt.
      const reallocated = await this.prisma.depositAddress.update({
        where: { id: reusable.id },
        data: {
          status: 'ALLOCATED',
          allocatedAt: new Date(),
          label: label ?? reusable.label,
        },
      });

      // Mirror allocation timestamp on the canonical Address row if present.
      await this.prisma.address.updateMany({
        where: { address: reallocated.address },
        data: {
          allocatedAt: reallocated.allocatedAt,
          lastActivityAt: new Date(),
        },
      });

      return {
        id: reallocated.id,
        address: reallocated.address,
        walletId: reallocated.walletId,
        network: reallocated.network,
        status: reallocated.status,
        label: reallocated.label,
        allocatedAt: reallocated.allocatedAt,
      };
    }

    // Generate a unique Stellar keypair address
    let address: string;
    let attempts = 0;
    do {
      address = StellarSdk.Keypair.random().publicKey();
      const existing = await this.prisma.depositAddress.findUnique({
        where: { address },
      });
      if (!existing) break;
      attempts++;
    } while (attempts < 5);

    if (attempts >= 5) {
      throw new ConflictException('Failed to generate a unique address');
    }

    const now = new Date();

    const depositAddress = await this.prisma.depositAddress.create({
      data: {
        address,
        walletId,
        network,
        label: label ?? null,
        status: 'ALLOCATED',
        allocatedAt: now,
      },
    });

    // Keep the Address table in sync: create a canonical row if it doesn't
    // exist yet so allocatedAt/lastActivityAt are tracked in one place.
    await this.prisma.address.upsert({
      where: { address },
      create: {
        address,
        network,
        walletId,
        allocatedAt: now,
        lastActivityAt: now,
      },
      update: {
        walletId,
        allocatedAt: now,
        lastActivityAt: now,
      },
    });

    return {
      id: depositAddress.id,
      address: depositAddress.address,
      walletId: depositAddress.walletId,
      network: depositAddress.network,
      status: depositAddress.status,
      label: depositAddress.label,
      allocatedAt: depositAddress.allocatedAt,
    };
  }

  async listByWallet(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: walletId, isActive: true, deletedAt: null },
    });
    if (!wallet || wallet.userId !== userId)
      throw new NotFoundException('Wallet not found');

    return this.prisma.depositAddress.findMany({
      where: { walletId },
      orderBy: { allocatedAt: 'desc' },
    });
  }

  verifyAddress(address: string): VerifyAddressResponseDto {
    // Fast-path: must start with 'G' (Ed25519 public key version byte)
    if (!address.startsWith('G')) {
      return {
        valid: false,
        address,
        reason: 'Address must start with G (Ed25519 public key prefix)',
      };
    }

    // StrKey.isValidEd25519PublicKey performs full StrKey decoding:
    // - Base32 decode
    // - Version byte check (0x06 << 3 = 0x30 → 'G')
    // - CRC-16 checksum validation
    // - Payload length check (32 bytes)
    const isValid = StrKey.isValidEd25519PublicKey(address);

    if (!isValid) {
      return {
        valid: false,
        address,
        reason: 'Invalid StrKey checksum or malformed address',
      };
    }

    return { valid: true, address };
  }

  /**
   * Marks a DepositAddress as AVAILABLE (released) once activity on it has
   * ceased.  Callers (e.g. a webhook handler) should invoke this after a
   * deposit has been fully reconciled so the address can be re-used.
   */
  async releaseDepositAddress(depositAddressId: string): Promise<void> {
    const existing = await this.prisma.depositAddress.findUnique({
      where: { id: depositAddressId },
    });
    if (!existing) {
      throw new NotFoundException('Deposit address not found');
    }

    await this.prisma.depositAddress.update({
      where: { id: depositAddressId },
      data: { status: 'AVAILABLE' },
    });

    // Reflect the release in the Address table so lastActivityAt is current.
    await this.prisma.address.updateMany({
      where: { address: existing.address },
      data: { lastActivityAt: new Date() },
    });
  }

  /**
   * Generates a memo (id, text, or hash) for a user wallet deposit.
   */
  async generateMemo(userId: string, dto: GenerateMemoDto) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: dto.walletId, isActive: true, deletedAt: null },
    });
    if (!wallet || wallet.userId !== userId) {
      throw new NotFoundException('Wallet not found');
    }

    const memoType = dto.memoType ?? MemoTypeOption.ID;
    let seedValue = dto.customValue ?? wallet.id;

    if (memoType === MemoTypeOption.ID && !/^\d+$/.test(seedValue)) {
      // Convert string seed (e.g. UUID) into a deterministic uint64 numeric string
      let hash = BigInt(0);
      for (let i = 0; i < seedValue.length; i++) {
        hash =
          (hash * BigInt(31) + BigInt(seedValue.charCodeAt(i))) %
          BigInt('18446744073709551615');
      }
      seedValue = hash.toString();
    }

    try {
      const generated = generateStellarMemo(memoType, seedValue);
      return {
        walletId: wallet.id,
        depositAddress: wallet.depositAddress,
        memoType: generated.type,
        memoValue: generated.value,
      };
    } catch (err: any) {
      throw new BadRequestException(
        err?.message ?? 'Failed to generate deposit memo',
      );
    }
  }

  /**
   * Validates format and routability of a deposit memo.
   */
  async validateMemo(dto: ValidateMemoDto) {
    const memoType = dto.memoType || 'none';
    const memoValue = dto.memoValue ?? null;

    const valResult = validateStellarMemo(memoType, memoValue);

    let routingResult: any = null;
    if (dto.destination) {
      try {
        routingResult = extractRouting({
          destination: dto.destination,
          memoType,
          memoValue,
          sourceAccount: null,
        });
      } catch (err: any) {
        valResult.warnings.push({
          code: 'INVALID_DESTINATION' as any,
          severity: 'error',
          message: err?.message ?? 'Invalid destination address',
        });
      }
    }

    return {
      valid: valResult.valid,
      memoType,
      memoValue,
      normalizedValue: valResult.normalizedValue,
      routingId:
        routingResult?.routingId?.toString() ?? valResult.normalizedValue,
      error: valResult.error,
      warnings: [...valResult.warnings, ...(routingResult?.warnings ?? [])],
    };
  }

  /**
   * Resolves deposit attribution from destination address + memo to the matching user/wallet.
   */
  async resolveDeposit(dto: ResolveDepositDto) {
    const memoType = dto.memoType ?? 'none';
    const memoValue = dto.memoValue ?? null;

    let routing: any;
    try {
      routing = extractRouting({
        destination: dto.destination,
        memoType,
        memoValue,
        sourceAccount: null,
      });
    } catch (err: any) {
      throw new BadRequestException(
        err?.message ?? 'Invalid destination address for routing',
      );
    }

    const targetAccount = routing.destinationBaseAccount ?? dto.destination;

    // Search wallet directly by depositAddress
    let wallet = await this.prisma.wallet.findFirst({
      where: { depositAddress: targetAccount, deletedAt: null },
    });

    // If not found directly, search in DepositAddress table
    if (!wallet) {
      const depositAddrRecord = await this.prisma.depositAddress.findUnique({
        where: { address: targetAccount },
        include: { wallet: true },
      });
      if (depositAddrRecord && !depositAddrRecord.wallet?.deletedAt) {
        wallet = depositAddrRecord.wallet;
      }
    }

    return {
      routed: !!wallet,
      destinationBaseAccount: routing.destinationBaseAccount,
      routingId: routing.routingId?.toString() ?? null,
      routingSource: routing.routingSource,
      walletId: wallet?.id ?? null,
      userId: wallet?.userId ?? null,
      warnings: routing.warnings,
    };
  }
}
