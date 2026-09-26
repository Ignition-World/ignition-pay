import { HttpException, HttpStatus } from '@nestjs/common';

export interface AssetPair {
  sellAsset: string;
  buyAsset: string;
}

// Allowed anchor asset pairs whitelist (can be synchronized dynamically from anchor info)
const ALLOWED_ASSET_PAIRS: Set<string> = new Set([
  'USDC:stellar-USD_NGN:bank',
  'USDC:stellar-USDC:stellar',
  'XLM:stellar-USDC:stellar',
]);

export function validateAssetPair(sellAsset: string, buyAsset: string): void {
  const pairKey = `${sellAsset}-${buyAsset}`;

  if (!ALLOWED_ASSET_PAIRS.has(pairKey)) {
    throw new HttpException(
      {
        error: 'INVALID_ASSET_PAIR',
        message: `The asset pair ${sellAsset} -> ${buyAsset} is not supported or allow-listed.`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}