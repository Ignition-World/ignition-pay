import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard'
import { Sep38Service } from './sep38.service'
import { RequestQuoteDto } from './dto/request-quote.dto'
import { QuoteResponseDto } from './dto/quote-response.dto'
import { Throttle } from '@nestjs/throttler'

@ApiTags('sep38')
@ApiBearerAuth()
@Controller('sep38')
@UseGuards(JwtAuthGuard)
export class Sep38Controller {
  constructor(private readonly sep38Service: Sep38Service) {}

  @Post('quote')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get a SEP-38 quote for fiat<>asset conversion' })
  @ApiResponse({
    status: 201,
    description: 'Quote generated',
    type: QuoteResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Anchor not found' })
  async getQuote(@Body() dto: RequestQuoteDto): Promise<QuoteResponseDto> {
    return this.sep38Service.getQuote(dto)
  }
}
