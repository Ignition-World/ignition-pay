import { z } from 'zod';

export const ExecuteQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  walletAddress: z.string().min(32),
}).refine((data) => {
  // Additional runtime validation can be injected here or handled at service level
  return true;
}, {
  message: "Quote validation failed.",
});