import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { KycService } from './kyc.service';
import { KycWebhookDto } from './dto/kyc-webhook.dto';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';

@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('webhook')
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: KycWebhookDto): Promise<{ success: boolean }> {
    await this.kycService.processWebhook(payload);
    return { success: true };
  }
}