import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/infrastructure/container';
import { getPublicSong, getSharePackage, listSongSlugs } from '@/application/use-cases/songs';
import { toSongView } from '@/lib/view-models';
import { encodeSharePackage, buildShareUrl } from '@/lib/share-link';
import { toBcp47 } from '@/domain/shared/language';
import { UI_LOCALES } from '@/domain/shared/language';
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

  const result = await getPublicSong(getContainer(), slug).catch(() => null);
  if (!result?.ok) return {};

  const song = result.value;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const tLang = await getTranslations({ locale, namespace: 'languages' });

  const pair = `${tLang(song.pair.source)} → ${tLang(song.pair.target)}`;
  const title = t('songTitle', {
    title: song.title,
    artist: song.artist,
    pair,
  });
  const description = t('songDescription', {
    title: song.title,
    artist: song.artist,
    target: tLang(song.pair.target),
  });

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/songs/${slug}`,
      languages: Object.fromEntries([
        ...UI_LOCALES.map((code) => [code, `/${code}/songs/${slug}`]),
        ['x-default', `/en/songs/${slug}`],
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
  const result = await getPublicSong(container, slug);
  if (!result.ok) notFound();

  const song = toSongView(result.value);
  const t = await getTranslations({ locale, namespace: 'song' });

  // The share link carries the full song in its fragment. It is built on the
  // server because that is where the complete body lives, and it is safe to
  // hand to the browser precisely because a fragment is never transmitted back.
  const sharePackage = await getSharePackage(container, slug);
  const encoded = sharePackage.ok ? encodeSharePackage(sharePackage.value) : null;
  const shareUrl =
    encoded?.ok === true ? buildShareUrl(siteUrl(), locale, encoded.value) : undefined;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicComposition',
    name: song.title,
    composer: { '@type': 'Person', name: song.artist },
    inLanguage: toBcp47(song.source),
    workTranslation: {
      '@type': 'MusicComposition',
      name: song.title,
      inLanguage: toBcp47(song.target),
      translator: { '@type': 'Organization', name: 'Feelyrics' },
    },
    url: `${siteUrl()}/${locale}/songs/${slug}`,
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
