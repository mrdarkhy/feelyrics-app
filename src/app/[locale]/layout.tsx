import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { UI_LOCALES } from '@/domain/shared/language';
import type { UiLocale } from '@/domain/shared/language';
import { siteUrl } from '@/lib/env';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Pre-render the shell for all three languages at build time.
 */
export function generateStaticParams() {
  return UI_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const origin = siteUrl();

  return {
    metadataBase: new URL(origin),
    title: {
      default: t('defaultTitle'),
      template: `%s · ${t('siteName')}`,
    },
    description: t('defaultDescription'),
    applicationName: t('siteName'),
    alternates: {
      canonical: `/${locale}`,
      // Telling search engines that the three language versions are the same
      // page is what stops them competing with each other for the same query.
      languages: Object.fromEntries([
        ...UI_LOCALES.map((code) => [code, `/${code}`]),
        ['x-default', `/${routing.defaultLocale}`],
      ]),
    },
    openGraph: {
      type: 'website',
      siteName: t('siteName'),
      title: t('defaultTitle'),
      description: t('defaultDescription'),
      url: `${origin}/${locale}`,
      locale,
    },
    twitter: {
      card: 'summary',
      title: t('defaultTitle'),
      description: t('defaultDescription'),
    },
    icons: {
      icon: '/icon-192.png',
      apple: '/icon-192.png',
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const viewport = {
  themeColor: '#0b1511',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Required for static rendering: without it, every page under this layout
  // opts into dynamic rendering the moment it reads a translation.
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'nav' });

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="fl-grain min-h-dvh antialiased">
        <NextIntlClientProvider>
          <ToastProvider>
            {/* First stop for a keyboard user, so the nav can be jumped past. */}
            <a
              href="#main"
              className="sr-only-focusable absolute left-4 top-4 z-50 rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-amber-ink"
            >
              {t('skipToContent')}
            </a>

            <div className="flex min-h-dvh flex-col">
              <SiteHeader />
              {/* No width or padding here on purpose: the library is a
                  full-bleed two-pane console and the ordinary pages are a
                  centred column, so each route group sets its own container. */}
              <main id="main" aria-label={t('mainLandmark')} className="flex-1">
                {children}
              </main>
              <SiteFooter />
            </div>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

export type LocaleParams = { locale: UiLocale };
