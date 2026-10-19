import { Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { RequestQuoteDto } from './dto/request-quote.dto'
import { QuoteResponseDto } from './dto/quote-response.dto'

const ANCHOR_CONFIGS: Record<string, { domain: string }> = {
  StellarX: { domain: 'https://api.stellarx.com' },
  AnchorUSD: { domain: 'https://api.anchorusd.com' },
  GateHub: { domain: 'https://api.gatehub.com' },
  PayMunk: { domain: 'https://api.paymunk.com' },
}

const FIAT_TO_USDC_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.26,
  INR: 0.012,
  PHP: 0.018,
  THB: 0.028,
}

const FEE_RATE = 0.005

@Injectable()
export class Sep38Service {
  constructor() {}

  private getAnchorConfig(anchorName: string): { domain: string } {
    const config = ANCHOR_CONFIGS[anchorName]
    if (!config) {
      throw new NotFoundException(`Unknown anchor: ${anchorName}`)
    }
    return config
  }

  async getQuote(req: RequestQuoteDto): Promise<QuoteResponseDto> {
    this.getAnchorConfig(req.anchorName)

    const quote = await this.fetchOrSimulateQuote(req)

    return {
      id: randomUUID(),
      price: quote.price,
      totalPrice: quote.totalPrice,
      sellAmount: quote.sellAmount,
      buyAmount: quote.buyAmount,
      sellAsset: quote.sellAsset,
      buyAsset: quote.buyAsset,
      fee: quote.fee,
      expiresAt: quote.expiresAt,
      createdAt: new Date().toISOString(),
    }
  }

  private async fetchOrSimulateQuote(req: RequestQuoteDto): Promise<{
    price: string
    totalPrice: string
    sellAmount: string
    buyAmount: string
    sellAsset: string
    buyAsset: string
    fee?: { total: string; asset: string }
    expiresAt: string
  }> {
    try {
      const response = await fetch(
        `https://api.stellarx.com/sep38/quote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sell_asset: `iso4217:${req.sellAsset}`,
            buy_asset: `stellar:${req.buyAsset}:GBBD47UZQ5ODSQIRQ73RQ5NBAYKU5NK2HRE3ENDQMAIL7UCHQVCD2Z4A`,
            sell_amount: req.sellAmount.toString(),
          }),
        },
      )
      if (response.ok) {
        const data = await response.json()
        return {
          price: data.price,
          totalPrice: (parseFloat(data.price) * req.sellAmount).toFixed(7),
          sellAmount: req.sellAmount.toString(),
          buyAmount: data.buy_amount,
          sellAsset: req.sellAsset,
          buyAsset: req.buyAsset,
          fee: data.fee ?? { total: '0', asset: req.buyAsset },
          expiresAt: data.expires_at,
        }
      }
    } catch {
      // Fall through to simulation
    }

    return this.simulateQuote(req)
  }

  private simulateQuote(req: RequestQuoteDto): {
    price: string
    totalPrice: string
    sellAmount: string
    buyAmount: string
    sellAsset: string
    buyAsset: string
    fee?: { total: string; asset: string }
    expiresAt: string
  } {
    const rate = FIAT_TO_USDC_RATES[req.sellAsset] ?? 1
    const buyAmountBeforeFee = req.sellAmount * rate
    const feeAmount = buyAmountBeforeFee * FEE_RATE
    const buyAmount = buyAmountBeforeFee - feeAmount
    const price = rate.toFixed(7)

    return {
      price,
      totalPrice: buyAmountBeforeFee.toFixed(7),
      sellAmount: req.sellAmount.toString(),
      buyAmount: buyAmount.toFixed(7),
      sellAsset: req.sellAsset,
      buyAsset: req.buyAsset,
      fee: { total: feeAmount.toFixed(7), asset: req.buyAsset },
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    }
  }
}
