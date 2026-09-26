import { HttpException, HttpStatus } from '@nestjs/common';

export async function validateAndExecuteQuote(quoteId: string): Promise<void> {
  const quote = await db.query('SELECT expires_at, status FROM quotes WHERE id = $1', [quoteId]);

  if (!quote.rows.length) {
    throw new HttpException('Quote not found', HttpStatus.NOT_FOUND);
  }

  const { expires_at, status } = quote.rows[0];
  const now = new Date();

  // Enforce server-side expiration check
  if (new Date(expires_at) < now) {
    throw new HttpException('Quote has expired', HttpStatus.BAD_REQUEST);
  }

  if (status !== 'PENDING') {
    throw new HttpException('Quote is no longer active', HttpStatus.BAD_REQUEST);
  }

  // Proceed with execution...
}