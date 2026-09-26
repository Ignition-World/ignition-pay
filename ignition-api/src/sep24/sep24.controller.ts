import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard';
import { Sep24Service } from './sep24.service';
import {
  InitiateSep24Dto,
  Sep24StatusDto,
  GetSep24HistoryQueryDto,
} from './dto/initiate-sep24.dto';
import {
  InitiateSep24ResponseDto,
  Sep24TransactionStatusResponseDto,
  Sep24HistoryResponseDto,
} from './dto/sep24-response.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('sep24')
@ApiBearerAuth()
@Controller('sep24')
@UseGuards(JwtAuthGuard)
export class Sep24Controller {
  constructor(private readonly sep24Service: Sep24Service) {}

  @Post('initiate')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Initiate a SEP-24 interactive deposit or withdrawal',
  })
  @ApiResponse({
    status: 201,
    description: 'Interactive flow initiated',
    type: InitiateSep24ResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or anchor error' })
  @ApiResponse({ status: 404, description: 'Anchor not found' })
  async initiate(
    @Body() dto: InitiateSep24Dto,
    @Request() req: any,
  ): Promise<InitiateSep24ResponseDto> {
    return this.sep24Service.initiate(dto, req.user.sub);
  }

  @Post('status')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Get SEP-24 transaction status' })
  @ApiResponse({
    status: 200,
    description: 'Transaction status',
    type: Sep24TransactionStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: transaction does not belong to user',
  })
  async getStatus(
    @Body() dto: Sep24StatusDto,
    @Request() req: any,
  ): Promise<Sep24TransactionStatusResponseDto> {
    return this.sep24Service.getStatus(dto.id, req.user.sub);
  }

  @Get('transactions/:id')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Get SEP-24 transaction status by internal ID' })
  @ApiResponse({
    status: 200,
    description: 'Transaction status',
    type: Sep24TransactionStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: transaction does not belong to user',
  })
  async getTransaction(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<Sep24TransactionStatusResponseDto> {
    return this.sep24Service.getStatus(id, req.user.sub);
  }

  @Get('history')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: "Get the authenticated user's SEP-24 anchor transaction history",
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of anchor deposits and withdrawals',
    type: Sep24HistoryResponseDto,
  })
  async getHistory(
    @Query() query: GetSep24HistoryQueryDto,
    @Request() req: any,
  ): Promise<Sep24HistoryResponseDto> {
    return this.sep24Service.getHistory(req.user.sub, query);
  }
}
