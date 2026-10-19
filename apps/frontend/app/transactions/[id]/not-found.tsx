'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

export default function TransactionNotFound() {
  const { t } = useTranslation('transactions');

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-8">
      <h1 className="text-2ml font-semibold tracking-tight">
        {t('notFound.title')}
      </h1>
      <p className="text-muted-foreground text-center">
        {t('notFound.description')}
      </p>
      <Button asChild>
        <Link href="/transactions">{t('notFound.backToList')}</Link>
      </Button>
    </main>
  );
}
