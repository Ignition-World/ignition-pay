import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuoteResponseDto } from './dto/quote-response.dto';

@Injectable()
export class Sep38Service {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a new SEP-38 RFQ quote.
   *
   * The price column is declared as Decimal(20,7) in the Prisma schema so that
   * sub-cent values (e.g. 0.00000000123) are stored without the lossy rounding
   * that a Float column introduces when a value has more than 8 significant
   * decimal digits.  We accept price as a plain string from the caller and pass
   * it directly to Prisma so that no intermediate JS Number conversion can
   * truncate it before the DB write.
   */
  async createQuote(
    userId: string,
    dto: CreateQuoteDto,
  ): Promise<QuoteResponseDto> {
    // Validate that the price string is a finite positive decimal number.
    const parsedPrice = new Prisma.Decimal(dto.price);
    if (parsedPrice.isNaN() || !parsedPrice.isFinite() || parsedPrice.lte(0)) {
      throw new BadRequestException('price must be a positive finite decimal');
    }

    const parsedSellAmount = new Prisma.Decimal(dto.sellAmount);
    if (
      parsedSellAmount.isNaN() ||
      !parsedSellAmount.isFinite() ||
      parsedSellAmount.lte(0)
    ) {
      throw new BadRequestException(
        'sellAmount must be a positive finite decimal',
      );
    }

    const quote = await this.prisma.sep38Quote.create({
      data: {
        userId,
        sellAsset: dto.sellAsset,
        buyAsset: dto.buyAsset,
        // Pass Prisma.Decimal directly — no JS Number conversion so precision
        // is never lost on the way to the database.
        sellAmount: parsedSellAmount,
        price: parsedPrice,
        expiresAt: new Date(dto.expiresAt),
      },
    });

    return this.toResponseDto(quote);
  }

  /**
   * Retrieve a quote by ID, scoped to the requesting user.
   */
  async getQuote(userId: string, quoteId: string): Promise<QuoteResponseDto> {
    const quote = await this.prisma.sep38Quote.findUnique({
      where: { id: quoteId },
    });

    if (!quote || quote.userId !== userId) {
      throw new NotFoundException(`Quote ${quoteId} not found`);
    }

    return this.toResponseDto(quote);
  }

  /**
   * Map a Prisma Sep38Quote row to the response DTO.
   *
   * price and sellAmount are returned as strings so that the serialised JSON
   * never loses precision through a JS Number round-trip.
   */
  private toResponseDto(quote: {
    id: string;
    userId: string;
    sellAsset: string;
    buyAsset: string;
    sellAmount: Prisma.Decimal;
    price: Prisma.Decimal;
    expiresAt: Date;
    createdAt: Date;
  }): QuoteResponseDto {
    return {
      id: quote.id,
      userId: quote.userId,
      sellAsset: quote.sellAsset,
      buyAsset: quote.buyAsset,
      sellAmount: quote.sellAmount.toFixed(),
      // toFixed() preserves all significant digits — no scientific notation,
      // no precision loss from Number coercion.
      price: quote.price.toFixed(),
      expiresAt: quote.expiresAt.toISOString(),
      createdAt: quote.createdAt.toISOString(),
    };
  }
}
