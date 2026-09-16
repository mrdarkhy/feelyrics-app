'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * Route-level error boundary.
 *
 * The digest is shown because it is the one string that connects what the reader
 * saw to a line in the server logs — without it, "it broke" is unactionable.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  React.useEffect(() => {
    console.error('[route-error]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-5 py-16 text-center">
      <h1 className="font-display text-2xl font-extrabold text-bone">{t('title')}</h1>
      <p className="text-[15px] leading-relaxed text-bone-muted">{t('body')}</p>
      {error.digest ? (
        <p className="font-mono text-[11px] text-olive">{error.digest}</p>
      ) : null}
      <Button variant="primary" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  );
}
