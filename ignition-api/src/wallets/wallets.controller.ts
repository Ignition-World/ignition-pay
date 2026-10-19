import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';
import { RequireScope } from '../api-keys/decorators/require-scope.decorator';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  /**
   * POST /wallets
   * Create a new wallet for the authenticated user.
   * Auto-generates a Stellar deposit address if none is provided.
   */
  @Post()
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('write')
  @ApiOperation({
    summary: 'Create a new wallet with deposit address and limits',
  })
  @ApiResponse({ status: 201, description: 'Wallet created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid deposit address' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Deposit address already in use' })
  async createWallet(@Request() req: any, @Body() dto: CreateWalletDto) {
    return this.walletsService.createWallet(req.user.sub, dto);
  }

  /**
   * GET /wallets
   * List wallets for the authenticated user.
   */
  @Get()
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('read')
  @ApiOperation({
    summary: 'List wallets for the authenticated user',
  })
  @ApiQuery({
    name: 'includeDeleted',
    required: false,
    type: Boolean,
    description: 'Whether to include soft-deleted wallets',
  })
  @ApiResponse({ status: 200, description: 'List of user wallets' })
  async getWallets(
    @Request() req: any,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const shouldIncludeDeleted = includeDeleted === 'true';
    return this.walletsService.getWalletsByUser(
      req.user?.sub,
      shouldIncludeDeleted,
    );
  }

  /**
   * GET /wallets/:id/balance
   * Get wallet's current balance and recent transactions.
   */
  @Get(':id/balance')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('read')
  @ApiOperation({
    summary: "Get wallet's current balance and recent transactions",
  })
  @ApiParam({ name: 'id', description: 'Wallet address or ID' })
  @ApiResponse({ status: 200, description: 'Balance and recent transactions' })
  @ApiResponse({ status: 400, description: 'Missing wallet id' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getBalance(@Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('Missing wallet id');
    }

    return this.walletsService.getBalanceAndRecentTransactions(id);
  }

  /**
   * GET /wallets/:id
   * Get wallet details by ID.
   */
  @Get(':id')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('read')
  @ApiOperation({
    summary: 'Get wallet details by ID',
  })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Wallet details' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWallet(@Request() req: any, @Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('Missing wallet id');
    }

    return this.walletsService.getWalletById(id, req.user?.sub);
  }

  /**
   * DELETE /wallets/:id
   * Soft-delete a wallet (Issue #424).
   * Transaction history and reconciliation links are preserved.
   */
  @Delete(':id')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('write')
  @ApiOperation({
    summary: 'Soft-delete a wallet',
  })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Wallet soft-deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async deleteWallet(@Request() req: any, @Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('Missing wallet id');
    }

    return this.walletsService.deleteWallet(id, req.user?.sub);
  }

  /**
   * POST /wallets/:id/restore
   * Restore a previously soft-deleted wallet.
   */
  @Post(':id/restore')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('write')
  @ApiOperation({
    summary: 'Restore a soft-deleted wallet',
  })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Wallet restored successfully' })
  @ApiResponse({ status: 400, description: 'Wallet is not deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async restoreWallet(@Request() req: any, @Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('Missing wallet id');
    }

    return this.walletsService.restoreWallet(id, req.user?.sub);
  }
}
