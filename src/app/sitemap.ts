import type { MetadataRoute } from 'next';
import { getContainer } from '@/infrastructure/container';
import { listSongs, listSongSlugs } from '@/application/use-cases/songs';
import { distinctPairs, pairSlug } from '@/lib/pairs';
import { UI_LOCALES } from '@/domain/shared/language';
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
  let slugs: readonly string[] = [];
  try {
    slugs = await listSongSlugs(getContainer());
  } catch {
    return entries;
  }

  for (const slug of slugs) {
    const path = `/songs/${slug}`;
    for (const locale of UI_LOCALES) {
      entries.push({
        url: `${origin}/${locale}${path}`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.9,
        alternates: alternatesFor(path),
      });
    }
  }

  // Pair pages. They rank for the query people actually type — "<language> song
  // translations" — and they are the only crawlable route into a filtered view
  // of the catalogue, since the rail's filters live in the browser.
  try {
    const summaries = await listSongs(getContainer());
    for (const pair of distinctPairs(summaries)) {
      const path = `/pairs/${pairSlug(pair)}`;
      for (const locale of UI_LOCALES) {
        entries.push({
          url: `${origin}/${locale}${path}`,
          lastModified: new Date(),
          changeFrequency: 'weekly',
          priority: 0.8,
          alternates: alternatesFor(path),
        });
      }
    }
  } catch {
    // Same tolerance as above: a missing database costs entries, not the build.
  }

  return entries;
}
