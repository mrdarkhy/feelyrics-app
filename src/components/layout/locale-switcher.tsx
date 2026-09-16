'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { UI_LOCALES } from '@/domain/shared/language';
import type { UiLocale } from '@/domain/shared/language';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Interface language switcher.
 *
 * Switching keeps you on the same page rather than dropping you at the home
 * page — losing your place is a small insult to pay for reading in your own
 * language. The transition is wrapped in `startTransition` so the current page
 * stays interactive while the new one streams in.
 */
export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const locale = useLocale() as UiLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = React.useTransition();

  function onChange(next: string) {
    startTransition(() => {
      // `usePathname` from next-intl returns the path without the locale
      // prefix, so replacing it under a new locale lands on the same page —
      // switching language keeps your place instead of sending you home.
      router.replace(pathname, { locale: next as UiLocale });
    });
  }

  return (
    <Select value={locale} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger
        aria-label={t('switcherLabel')}
        className="h-9 w-auto min-w-[7.5rem] gap-1.5 px-3 text-[13px]"
      >
        <span className="inline-flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="text-olive"
          >
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M1.5 8h13M8 1.5c1.8 2 2.7 4.2 2.7 6.5S9.8 12.5 8 14.5c-1.8-2-2.7-4.2-2.7-6.5S6.2 3.5 8 1.5Z"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {UI_LOCALES.map((code) => (
          <SelectItem key={code} value={code}>
            {t(code)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
