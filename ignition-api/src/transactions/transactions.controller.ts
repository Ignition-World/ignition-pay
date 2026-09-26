import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';
import { RequireScope } from '../api-keys/decorators/require-scope.decorator';
import { TransactionsService } from './transactions.service';
import {
  GetTransactionsQueryDto,
  GetTransactionsResponseDto,
  SubmitTransactionDto,
  SubmitTransactionResponseDto,
} from './dto/get-transactions.dto';
import {
  StaleTransactionCountDto,
  TransactionErrorResponseDto,
} from './dto/transaction-error.dto';
import { StaleTransactionMonitorService } from './stale-transaction-monitor.service';

/**
 * Every route here is authenticated with an **API key in the `X-API-Key`
 * header**, not with a JWT. `ApiKeyGuard` reads and SHA-256-hashes the header
 * and looks the digest up in the `api_keys` table; `ApiKeyScopeGuard` then
 * enforces the `@RequireScope` level. Keys are minted and revoked through
 * `POST/DELETE /api-keys` (JWT bearer, see `ApiKeysController`).
 *
 * The header is documented with `@ApiHeader` rather than `@ApiSecurity`
 * because the `DocumentBuilder` in `main.ts` only registers the `JWT-auth`
 * bearer scheme, so an `X-API-Key` security scheme is not declared in the
 * generated document. Registering it needs a one-line
 * `addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'X-API-Key')`
 * in `main.ts`.
 */
@ApiTags('transactions')
@ApiHeader({
  name: 'X-API-Key',
  required: true,
  description:
    'API key for the transactions resource. Created via POST /api-keys (JWT bearer). ' +
    'Key scope must satisfy the required level: `read` for GET, `write` for POST. ' +
    'Scope precedence is admin > write > read.',
  example: 'sk_9f2c1a4b7d3e5f6081a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f7081',
})
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
  @ApiOperation({
    summary: 'Count of stale PENDING/PROCESSING transactions',
    description:
      'Counts transactions that have been PENDING longer than ' +
      'STALE_TX_PENDING_TIMEOUT_MINUTES (default 30) or PROCESSING longer than ' +
      'STALE_TX_PROCESSING_TIMEOUT_MINUTES (default 15). ' +
      'Requires an API key with at least `read` scope.',
  })
  @ApiResponse({ status: 200, description: 'Stale transaction counts', type: StaleTransactionCountDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid X-API-Key', type: TransactionErrorResponseDto })
  @ApiResponse({ status: 403, description: 'API key scope is insufficient', type: TransactionErrorResponseDto })
  getStaleCount(): Promise<StaleTransactionCountDto> {
    return this.staleTransactionMonitor.countStale();
  }

  /**
   * GET /transactions
   * List transactions with cursor pagination and optional filters:
   * cursor, limit, dateFrom, dateTo, status, asset, type, search
   */
  @Get()
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('read')
  @ApiOperation({
    summary: 'Get paginated transactions with optional filters',
    description:
      'Cursor-paginated list ordered by `createdAt` descending, then `id` descending. ' +
      'Pass the previous response\'s `nextCursor` back as `cursor` to fetch the next page; ' +
      'there is no offset/`page` parameter and no total count. ' +
      'Filters compose — a request may combine `status`, `asset` (or its legacy alias `type`), ' +
      'the `dateFrom`/`dateTo` window and `search`. ' +
      'Requires an API key with at least `read` scope.',
  })
  @ApiResponse({ status: 200, description: 'Paginated transaction list', type: GetTransactionsResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Query validation failed — `message` carries the class-validator constraint list',
    type: TransactionErrorResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid X-API-Key', type: TransactionErrorResponseDto })
  @ApiResponse({ status: 403, description: 'API key scope is insufficient', type: TransactionErrorResponseDto })
  getTransactions(@Query() query: GetTransactionsQueryDto) {
    return this.transactionsService.getTransactions(query);
  }

  /**
   * POST /transactions
   * Submit a new transaction.
   *
   * Two deduplication mechanisms are available and either may be used:
   *
   * 1. `Idempotency-Key` header (Issue #615) — any v4 UUID, independent of the
   *    transaction hash, so it works before the hash is known. Two concurrent
   *    requests with the same key cannot both create a transaction.
   * 2. `stellarTxHash` in the body (Issue #244) — resubmitting a known Stellar
   *    hash returns the existing record.
   *
   * If the same key is seen again within 24 hours the original response is
   * replayed verbatim, including when the request payload differs.
   */
  @Post()
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('write')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Optional version 4 UUID that makes this submission replay-safe. Stored as a SHA-256 ' +
      'digest for 24 hours. A repeat of the same key returns the original response without ' +
      're-executing, even if the body differs. A key whose original request is still in ' +
      'flight returns 409. A failed request releases the key so it can be retried.',
    example: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  })
  @ApiOperation({
    summary: 'Submit a transaction (idempotent via Idempotency-Key or stellarTxHash)',
    description:
      'Validates both wallets and the asset against the target network, then records the ' +
      'transfer as PENDING. ' +
      'Send an `Idempotency-Key` header (v4 UUID) to make retries safe when the Stellar tx ' +
      'hash is not known yet; alternatively include `stellarTxHash` in the body to dedupe on ' +
      'the hash itself. `alreadyExisted` in the response reports whether a row was created or ' +
      'an existing one was replayed. ' +
      'Requires an API key with at least `write` scope.',
  })
  @ApiResponse({
    status: 201,
    description: 'Transaction created, or the existing record returned for a duplicate submission',
    type: SubmitTransactionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid input — a failed DTO validation, an unknown network/asset combination, an ' +
      'invalid wallet address, or a non-UUID `Idempotency-Key`',
    type: TransactionErrorResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid X-API-Key', type: TransactionErrorResponseDto })
  @ApiResponse({ status: 403, description: 'API key scope is insufficient', type: TransactionErrorResponseDto })
  @ApiResponse({
    status: 409,
    description:
      'A request with this Idempotency-Key is still in progress, or a transaction with this ' +
      'Stellar tx hash already exists',
    type: TransactionErrorResponseDto,
  })
  submitTransaction(
    @Body() dto: SubmitTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.transactionsService.submitTransaction(dto, idempotencyKey);
  }
}
