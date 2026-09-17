import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { UI_LOCALES } from '@/domain/shared/language';
import { getContainer } from '@/infrastructure/container';
import { listSongs } from '@/application/use-cases/songs';
import { toSongSummaryView } from '@/lib/view-models';
import { LibraryShell } from '@/components/library/library-shell';

/**
 * The library shell.
 *
 * The catalogue is fetched here rather than in each page, which is what lets the
 * rail survive navigation between songs: a layout does not re-render when a
 * child route changes, so the list, its filters and its scroll position all
 * stay put.
 *
 * Summaries carry no lyric lines at all — see `listSummaries` — so shipping the
 * whole catalogue to the browser cannot leak a body even by accident.
 */

export function generateStaticParams() {
  return UI_LOCALES.map((locale) => ({ locale }));
}

/**
 * Static, but not frozen. The catalogue is prerendered — that is what makes the
 * library open instantly — and revalidated in the background so an accepted
 * suggestion or a newly added song appears without a deploy. Five minutes is
 * chosen against how often the catalogue actually changes, which is a few times
 * a day at most.
 */
export const revalidate = 300;

export default async function LibraryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const summaries = await listSongs(getContainer());
  const songs = summaries.map(toSongSummaryView);

  return <LibraryShell songs={songs}>{children}</LibraryShell>;
}
