import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Sep38Service } from './sep38.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuoteResponseDto } from './dto/quote-response.dto';

@ApiTags('sep38')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sep38')
export class Sep38Controller {
  constructor(private readonly sep38Service: Sep38Service) {}

  @Post('quotes')
  @ApiOperation({ summary: 'Request a new SEP-38 RFQ quote' })
  @ApiCreatedResponse({ type: QuoteResponseDto })
  async createQuote(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateQuoteDto,
  ): Promise<QuoteResponseDto> {
    return this.sep38Service.createQuote(req.user.id, dto);
  }

  @Get('quotes/:id')
  @ApiOperation({ summary: 'Retrieve a SEP-38 RFQ quote by ID' })
  @ApiOkResponse({ type: QuoteResponseDto })
  async getQuote(
    @Request() req: { user: { id: string } },
    @Param('id') quoteId: string,
  ): Promise<QuoteResponseDto> {
    return this.sep38Service.getQuote(req.user.id, quoteId);
  }
}
