import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';
import { RequireScope } from '../api-keys/decorators/require-scope.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':walletId')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('write')
  @ApiOperation({ summary: 'Initiate a payment from a wallet' })
  @ApiParam({ name: 'walletId', description: 'Sender wallet ID' })
  @ApiResponse({ status: 201, description: 'Payment queued' })
  @ApiResponse({ status: 400, description: 'Invalid payment details' })
  @ApiResponse({
    status: 403,
    description: 'Wallet is suspended or closed',
  })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  create(@Param('walletId') walletId: string, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.initiatePayment(walletId, dto);
  }
}
