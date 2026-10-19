'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

import { Button } from '@/components/ui/button';

export default function TransactionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-8">
      <h1 className="text-2ml font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-muted-foreground text-center">
        We could not load this transaction. Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
