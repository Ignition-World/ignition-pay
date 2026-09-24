import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';
import { RequireScope } from '../api-keys/decorators/require-scope.decorator';
import { TransactionsService } from './transactions.service';
import {
  GetTransactionsQueryDto,
  SubmitTransactionDto,
} from './dto/get-transactions.dto';
import { StaleTransactionMonitorService } from './stale-transaction-monitor.service';



@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly staleTransactionMonitor: StaleTransactionMonitorService,
  ) {}

  /**
   * GET /transactions/stale/count
   * Admin visibility into transactions past the stale PENDING/PROCESSING thresholds.
   */
  @Get('stale/count')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('read')
  @ApiOperation({ summary: 'Count of stale PENDING/PROCESSING transactions' })
  getStaleCount() {
    return this.staleTransactionMonitor.countStale();
  }

  /**
   * GET /transactions
   * List transactions with pagination and optional filters:
   * page, limit, dateFrom, dateTo, status, type
   */
  @Get()
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('read')
  @ApiOperation({ summary: 'Get paginated transactions with optional filters' })
  @ApiResponse({ status: 200, description: 'Paginated transaction list' })
  getTransactions(@Query() query: GetTransactionsQueryDto) {
    return this.transactionsService.getTransactions(query);
  }

  /**
   * POST /transactions
   * Submit a new transaction with idempotency support via stellarTxHash.
   * If the same stellarTxHash is submitted again (e.g. after a network blip)
   * the existing record is returned instead of creating a duplicate.
   */
  @Post()
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('write')
  @ApiOperation({ summary: 'Submit a transaction (idempotent via stellarTxHash)' })
  @ApiResponse({ status: 201, description: 'Transaction created or existing record returned' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  submitTransaction(@Body() dto: SubmitTransactionDto) {
    return this.transactionsService.submitTransaction(dto);
  }
}
