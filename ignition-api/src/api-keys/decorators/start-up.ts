// import { Injectable } from '@nestjs/common';
// import { Prisma } from '@prisma/client';
// import { PrismaService } from '../prisma/prisma.service';
// import {
//   GetTransactionsQueryDto,
//   GetTransactionsResponseDto,
// } from './dto/get-transactions.dto';

// @Injectable()
// export class TransactionsService {
//   constructor(private readonly prisma: PrismaService) {}

//   async getTransactions(
//     query: GetTransactionsQueryDto,
//   ): Promise<GetTransactionsResponseDto> {
//     const { page, limit, dateFrom, dateTo, status, type } = query;
//     const skip = (page - 1) * limit;

//     const where: Prisma.DonationWhereInput = {};

//     if (status) where.status = status as any;
//     if (type) where.assetCode = { equals: type, mode: 'insensitive' };

//     if (dateFrom || dateTo) {
//       where.donatedAt = {
//         ...(dateFrom && { gte: new Date(dateFrom) }),
//         ...(dateTo && { lte: new Date(dateTo) }),
//       };
//     }

//     const [total, donations] = await Promise.all([
//       this.prisma.donation.count({ where }),
//       this.prisma.donation.findMany({
//         where,
//         select: {
//           id: true,
//           amount: true,
//           assetCode: true,
//           txHash: true,
//           status: true,
//           donorId: true,
//           campaignId: true,
//           donatedAt: true,
//           confirmedAt: true,
//           createdAt: true,
//         },
//         orderBy: { donatedAt: 'desc' },
//         skip,
//         take: limit,
//       }),
//     ]);

//     return {
//       data: donations.map((d) => ({
//         ...d,
//         amount: Number(d.amount),
//         type: d.assetCode,
//       })),
//       total,
//       page,
//       limit,
//     };
//   }
// }

// import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
// import { CACHE_MANAGER } from '@nestjs/cache-manager';
// import { ConfigService } from '@nestjs/config';
// import { randomBytes } from 'crypto';
// import Keyv from 'keyv';

// @Injectable()
// export class AuthChallengeService {
//   private readonly defaultTtlMs = 5 * 60 * 1000;

//   constructor(
//     @Inject(CACHE_MANAGER) private readonly cache: Keyv,
//     private readonly config: ConfigService,
//   ) {}

//   async issueChallenge(walletAddress: string): Promise<string> {
//     const nonce = randomBytes(16).toString('hex');
//     const timestamp = Math.floor(Date.now() / 1000);
//     const challenge = `stellaraid:login:${nonce}:${timestamp}`;
//     const ttlMs = this.getTtlMs();

//     await this.cache.set(this.getCacheKey(walletAddress), challenge, ttlMs);

//     return challenge;
//   }

//   async consumeChallenge(
//     walletAddress: string,
//     challenge: string,
//   ): Promise<void> {
//     const storedChallenge = await this.cache.get(
//       this.getCacheKey(walletAddress),
//     );

//     if (!storedChallenge || storedChallenge !== challenge) {
//       throw new UnauthorizedException('Challenge expired or already used');
//     }

//     await this.cache.delete(this.getCacheKey(walletAddress));
//   }

//   private getCacheKey(walletAddress: string): string {
//     return `auth:challenge:${walletAddress}`;
//   }

//   private getTtlMs(): number {
//     const configuredTtl = this.config.get<string>('AUTH_CHALLENGE_TTL_MS');
//     const parsedTtl = Number(configuredTtl ?? this.defaultTtlMs);

//     return Number.isFinite(parsedTtl) && parsedTtl > 0
//       ? parsedTtl
//       : this.defaultTtlMs;
//   }
// }
