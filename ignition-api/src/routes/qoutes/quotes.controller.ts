import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { validateAssetPair } from '../../services/asset-pair.validator';

@Controller('sep38/quote')
export class QuotesController {
  @Post()
  async createQuote(@Body() body: { sellAsset: string; buyAsset: string; amount: string }) {
    // Enforce strict server-side allow-list validation prior to processing quote
    validateAssetPair(body.sellAsset, body.buyAsset);

    // Proceed with SEP-38 quote generation...
    return { status: 'PENDING_QUOTE' };
  }
}