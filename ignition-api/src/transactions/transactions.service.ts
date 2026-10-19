import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GetTransactionsQueryDto,
  GetTransactionsResponseDto,
} from './dto/get-transactions.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTransactions(
    query: GetTransactionsQueryDto,
  ): Promise<GetTransactionsResponseDto> {
    const { page, limit, dateFrom, dateTo, status, type, sort } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DonationWhereInput = {};

    if (status) where.status = status as any;
    if (type) where.assetCode = { equals: type, mode: 'insensitive' };

    if (dateFrom || dateTo) {
      where.donatedAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    // Parse the sort param: a leading '-' means descending, no prefix means ascending.
    // Defaults to newest-first ('-donatedAt') when the param is omitted.
    const sortParam = sort ?? '-donatedAt';
    const isDescending = sortParam.startsWith('-');
    const sortField = isDescending ? sortParam.slice(1) : sortParam;
    const sortDirection: Prisma.SortOrder = isDescending ? 'desc' : 'asc';

    const [total, donations] = await Promise.all([
      this.prisma.donation.count({ where }),
      this.prisma.donation.findMany({
        where,
        select: {
          id: true,
          amount: true,
          assetCode: true,
          txHash: true,
          status: true,
          donorId: true,
          campaignId: true,
          donatedAt: true,
          confirmedAt: true,
          createdAt: true,
        },
        orderBy: { [sortField]: sortDirection },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: donations.map((d) => ({
        ...d,
        amount: Number(d.amount),
        type: d.assetCode,
      })),
      total,
      page,
      limit,
    };
  }
}
