import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/infrastructure/container';
import { getPublicSong, getSharePackage, listSongSlugs } from '@/application/use-cases/songs';
import { toSongView } from '@/lib/view-models';
import { encodeSharePackage, buildShareUrl } from '@/lib/share-link';
import { isUiLocale, toBcp47 } from '@/domain/shared/language';
import { DEFAULT_LOCALE, UI_LOCALES } from '@/domain/shared/language';
import {
  defaultLocaleFor,
  songMetaDescription,
  songMetaTitle,
} from '@/domain/song/search-phrase';
import { siteUrl } from '@/lib/env';
import { Link } from '@/i18n/navigation';
import { SongReader } from '@/components/song/song-reader';
import { Button } from '@/components/ui/button';

/**
 * A song page.
 *
 * This is the SEO surface: somebody searches "<song> english translation" and
 * this is what should meet them. Hence the per-song title, description,
 * `hreflang` set and `MusicComposition` markup — and hence, equally, the
 * two-line cap, because the page has to be findable without republishing the
 * lyric.
 */

/**
 * One read per request, not two.
 *
 * `generateMetadata` and the page body both need the song, and without this they
 * each hit the database for it. `cache` makes the second call return the first
 * one's result for the duration of the request.
 */
const loadSong = cache(async (slug: string) =>
  getPublicSong(getContainer(), slug),
);

export async function generateStaticParams() {
  // Static params are best-effort: during a build without a database the page
  // simply renders on demand instead of failing the whole build.
  try {
    const slugs = await listSongSlugs(getContainer());
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;

  const result = await loadSong(slug).catch(() => null);
  if (!result?.ok) return {};

  const song = result.value;
  const uiLocale = isUiLocale(locale) ? locale : DEFAULT_LOCALE;

  const meta = {
    locale: uiLocale,
    target: song.pair.target,
    title: song.title,
    artist: song.artist,
    feelProfile: song.feelProfile,
  };
  const title = songMetaTitle(meta);
  const description = songMetaDescription(meta);

  // x-default is the page for somebody the engine has no language signal for.
  // For a song that is the language it was translated *into*: a German song
  // rendered into Turkish is a Turkish page before it is an English one.
  const fallbackLocale = defaultLocaleFor(song.pair.target);

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/songs/${slug}`,
      languages: Object.fromEntries([
        ...UI_LOCALES.map((code) => [code, `/${code}/songs/${slug}`]),
        ['x-default', `/${fallbackLocale}/songs/${slug}`],
      ]),
    },
    openGraph: {
      type: 'article',
      title,
      description,
      url: `${siteUrl()}/${locale}/songs/${slug}`,
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function SongPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const container = getContainer();
  const result = await loadSong(slug);
  if (!result.ok) notFound();

  const song = toSongView(result.value);
  const updatedAt = result.value.updatedAt;
  const t = await getTranslations({ locale, namespace: 'song' });

  // The share link carries the full song in its fragment. It is built on the
  // server because that is where the complete body lives, and it is safe to
  // hand to the browser precisely because a fragment is never transmitted back.
  const sharePackage = await getSharePackage(container, slug);
  const encoded = sharePackage.ok ? encodeSharePackage(sharePackage.value) : null;
  const shareUrl =
    encoded?.ok === true ? buildShareUrl(siteUrl(), locale, encoded.value) : undefined;

  // Structured data for the original and, as a separate work, our rendering of
  // it. Two things are deliberately *not* claimed. The artist is marked as who
  // recorded the song, not as its composer: the credited performer is often not
  // the writer, and the writer is the person a permission conversation would
  // have to reach. And the translator is only ever named where a human actually
  // signed the rendering off — an unvalidated draft is credited to the project.
  const pageUrl = `${siteUrl()}/${locale}/songs/${slug}`;
  const compositionId = `${pageUrl}#composition`;

  const feelyrics = { '@type': 'Organization', name: 'Feelyrics', url: siteUrl() };
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicComposition',
    '@id': compositionId,
    name: song.title,
    inLanguage: toBcp47(song.source),
    recordedAs: {
      '@type': 'MusicRecording',
      name: song.title,
      byArtist: { '@type': 'MusicGroup', name: song.artist },
    },
    workTranslation: {
      '@type': 'MusicComposition',
      name: song.title,
      inLanguage: toBcp47(song.target),
      ...(song.feelProfile ? { description: song.feelProfile } : {}),
      translationOfWork: { '@id': compositionId },
      dateModified: updatedAt.toISOString().slice(0, 10),
      translator: song.validatedBy
        ? [feelyrics, { '@type': 'Person', name: song.validatedBy }]
        : feelyrics,
      isAccessibleForFree: true,
    },
    url: pageUrl,
  };

  return (
    <div className="fl-enter max-w-4xl space-y-8">
      <script
        type="application/ld+json"
        // Values come from our own database and are serialised by JSON.stringify,
        // so there is no user-controlled markup here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Beside the rail this link is a second door to a room you are standing
          in. It earns its place only where the rail is not on screen. */}
      <Button asChild variant="quiet" size="sm" className="-ml-3 lg:hidden">
        <Link href="/">← {t('backToLibrary')}</Link>
      </Button>

      <SongReader song={song} songId={song.id} shareUrl={shareUrl} canSuggest />
    </div>
  );
}
