import type { MetadataRoute } from 'next';
import { getContainer } from '@/infrastructure/container';
import { listSongs } from '@/application/use-cases/songs';
import type { SongSummary } from '@/application/ports/repositories';
import { distinctPairs, pairSlug } from '@/lib/pairs';
import { groupingLanguage, UI_LOCALES } from '@/domain/shared/language';
import { defaultLocaleFor } from '@/domain/song/search-phrase';
import { siteUrl } from '@/lib/env';

/**
 * The sitemap.
 *
 * Every page is listed once per language, each entry carrying the full
 * `alternates.languages` set — which is how a search engine learns that the
 * three are the same page rather than three thin duplicates competing for the
 * same query.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();

  const alternatesFor = (path: string) => ({
    languages: Object.fromEntries(
      UI_LOCALES.map((locale) => [locale, `${origin}/${locale}${path}`]),
    ),
  });

  const staticPaths = ['', '/requests', '/about'];

  const entries: MetadataRoute.Sitemap = staticPaths.flatMap((path) =>
    UI_LOCALES.map((locale) => ({
      url: `${origin}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: path === '' ? 1 : 0.7,
      alternates: alternatesFor(path),
    })),
  );

  // A build without a database still produces a valid sitemap of static pages
  // rather than failing outright.
  let summaries: readonly SongSummary[] = [];
  try {
    summaries = await listSongs(getContainer(), { limit: 500 });
  } catch {
    return entries;
  }

  for (const song of summaries) {
    const path = `/songs/${song.slug}`;
    // Three URLs exist for every song, but they are not equally the page: the
    // one that speaks the language the song was translated into is where the
    // reader of this translation belongs, and the other two are the interface
    // in another language. The priority says so instead of claiming a tie.
    const primary = defaultLocaleFor(song.target);
    for (const locale of UI_LOCALES) {
      entries.push({
        url: `${origin}/${locale}${path}`,
        // The song's own timestamp, not the time of the crawl. A sitemap that
        // reports everything as changed today teaches search engines to ignore
        // the field.
        lastModified: song.updatedAt,
        changeFrequency: 'monthly',
        priority: locale === primary ? 0.9 : 0.6,
        alternates: alternatesFor(path),
      });
    }
  }

  // Pair pages. They rank for the query people actually type — "<language> song
  // translations" — and they are the only crawlable route into a filtered view
  // of the catalogue, since the rail's filters live in the browser.
  for (const pair of distinctPairs(summaries)) {
    const path = `/pairs/${pairSlug(pair)}`;
    // The pair page is as fresh as the newest song in it.
    const lastModified = summaries
      .filter(
        (song) =>
          groupingLanguage(song.source) === pair.source &&
          song.target === pair.target,
      )
      .reduce<Date>(
        (latest, song) => (song.updatedAt > latest ? song.updatedAt : latest),
        new Date(0),
      );

    for (const locale of UI_LOCALES) {
      entries.push({
        url: `${origin}/${locale}${path}`,
        lastModified,
        changeFrequency: 'weekly',
        priority: 0.8,
        alternates: alternatesFor(path),
      });
    }
  }

  return entries;
}
