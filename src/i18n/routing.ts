import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, UI_LOCALES } from '@/domain/shared/language';

/**
 * Locale routing.
 *
 * `always` prefixing means every page has one canonical URL per language
 * (/en/…, /tr/…, /es/…) with no unprefixed duplicate. That keeps `hreflang`
 * honest and stops search engines from seeing the same page twice — which
 * matters here, because being found when somebody searches for a song's
 * translation is the whole distribution plan.
 */
export const routing = defineRouting({
  locales: UI_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  localeDetection: true,
});
