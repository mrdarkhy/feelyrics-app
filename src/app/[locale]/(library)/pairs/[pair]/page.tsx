import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getContainer } from '@/infrastructure/container';
import { listSongs } from '@/application/use-cases/songs';
import { toSongSummaryView } from '@/lib/view-models';
import { distinctPairs, pairSlug, parsePairSlug } from '@/lib/pairs';
import { groupingLanguage, UI_LOCALES } from '@/domain/shared/language';
import { siteUrl } from '@/lib/env';
import { SongShelf } from '@/components/library/song-shelf';

/**
 * One page per translation direction.
 *
 * This exists for search. People look for "İtalyanca şarkı sözleri Türkçe
 * çeviri", not for a filter state — and a filter state is exactly what a crawler
 * cannot reach, because it lives in a client component's memory and has no URL.
 * A pair page has a URL, a heading, its own `hreflang` set, and real links into
 * the songs underneath it.
 */

export async function generateStaticParams() {
  try {
    const summaries = await listSongs(getContainer());
    return distinctPairs(summaries).map((pair) => ({ pair: pairSlug(pair) }));
  } catch {
    // A build without a database still succeeds; these pages render on demand.
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; pair: string }>;
}): Promise<Metadata> {
  const { locale, pair: slug } = await params;
  const pair = parsePairSlug(slug);
  if (!pair) return {};

  const t = await getTranslations({ locale, namespace: 'meta' });
  const tLang = await getTranslations({ locale, namespace: 'languages' });

  const title = t('pairTitle', {
    source: tLang(pair.source),
    target: tLang(pair.target),
  });
  const description = t('pairDescription', {
    source: tLang(pair.source),
    target: tLang(pair.target),
  });

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/pairs/${slug}`,
      languages: Object.fromEntries([
        ...UI_LOCALES.map((code) => [code, `/${code}/pairs/${slug}`]),
        ['x-default', `/en/pairs/${slug}`],
      ]),
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${siteUrl()}/${locale}/pairs/${slug}`,
    },
  };
}

export default async function PairPage({
  params,
}: {
  params: Promise<{ locale: string; pair: string }>;
}) {
  const { locale, pair: slug } = await params;
  setRequestLocale(locale);

  const pair = parsePairSlug(slug);
  if (!pair) notFound();

  const summaries = await listSongs(getContainer());
  const songs = summaries
    .map(toSongSummaryView)
    .filter(
      (song) =>
        groupingLanguage(song.source) === pair.source && song.target === pair.target,
    );

  if (songs.length === 0) notFound();

  const t = await getTranslations({ locale, namespace: 'library' });
  const tLang = await getTranslations({ locale, namespace: 'languages' });

  return (
    <div className="fl-enter max-w-4xl space-y-8">
      <div className="space-y-3">
        <Link
          href="/"
          className="text-[13px] font-semibold text-patina transition-colors hover:text-bone"
        >
          ← {t('title')}
        </Link>
        <h1
          id="pair-songs"
          className="font-display text-[clamp(1.8rem,4.5vw,2.5rem)] font-extrabold leading-tight text-bone"
        >
          {t('groupHeading', {
            source: tLang(pair.source),
            target: tLang(pair.target),
          })}
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-bone-muted">
          {t('pairIntro', {
            count: songs.length,
            source: tLang(pair.source),
            target: tLang(pair.target),
          })}
        </p>
      </div>

      <SongShelf songs={songs} headingId="pair-songs" />
    </div>
  );
}
