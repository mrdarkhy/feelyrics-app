import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getContainer } from '@/infrastructure/container';
import { listSongs } from '@/application/use-cases/songs';
import { toSongSummaryView } from '@/lib/view-models';
import { distinctPairs, pairSlug } from '@/lib/pairs';
import { SongShelf } from '@/components/library/song-shelf';
import { Button } from '@/components/ui/button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('libraryTitle'),
    description: t('libraryDescription'),
    alternates: { canonical: `/${locale}` },
  };
}

/**
 * What sits beside the rail when nothing is open.
 *
 * Deliberately not a second copy of the catalogue: the rail is the catalogue.
 * This is the answer to "I do not know what I am looking for" — the newest work,
 * a way into each language pair, and what the site actually does.
 */
export default async function LibraryHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'home' });
  const tLang = await getTranslations({ locale, namespace: 'languages' });

  const summaries = await listSongs(getContainer());
  const songs = summaries.map(toSongSummaryView);

  const newest = [...songs]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  const pairs = distinctPairs(songs);

  return (
    <div className="fl-enter max-w-4xl space-y-12">
      <section className="space-y-5">
        <h1 className="font-display text-[clamp(1.9rem,5vw,3rem)] font-extrabold leading-[1.08] text-bone">
          {t('heroTitle')}
        </h1>
        <p className="max-w-2xl text-[16px] leading-relaxed text-bone-muted">
          {t('heroBody')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="primary" size="lg">
            <Link href="/requests">{t('requestCta')}</Link>
          </Button>
          <p className="text-[13px] text-olive">
            {t('statsSongs', { count: songs.length })} ·{' '}
            {t('statsPairs', { count: pairs.length })}
          </p>
        </div>
        {/* Only worth saying where there is in fact a list to the left. */}
        <p className="hidden text-[13px] text-patina lg:block">{t('pickASong')}</p>
      </section>

      <section aria-labelledby="just-added-heading" className="space-y-4">
        <h2
          id="just-added-heading"
          className="font-display text-xl font-extrabold text-bone"
        >
          {t('justAdded')}
        </h2>
        <SongShelf songs={newest} headingId="just-added-heading" />
      </section>

      <section aria-labelledby="pairs-heading" className="space-y-4">
        <h2 id="pairs-heading" className="font-display text-xl font-extrabold text-bone">
          {t('browsePairs')}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {pairs.map((pair) => (
            <li key={pairSlug(pair)}>
              <Link
                href={`/pairs/${pairSlug(pair)}`}
                className="inline-block rounded-pill border border-line px-3.5 py-1.5 text-[13px] font-semibold text-bone-muted transition-colors hover:border-line-strong hover:text-bone"
              >
                {tLang(pair.source)} → {tLang(pair.target)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="space-y-4">
        <h2 id="how-heading" className="font-display text-xl font-extrabold text-bone">
          {t('howTitle')}
        </h2>
        <ol className="fl-stagger grid gap-3 sm:grid-cols-3">
          {(['one', 'two', 'three'] as const).map((step, index) => (
            <li key={step} className="fl-surface space-y-2 p-4">
              <span
                aria-hidden="true"
                className="inline-flex size-7 items-center justify-center rounded-pill bg-amber-soft font-display text-[13px] font-extrabold text-amber"
              >
                {index + 1}
              </span>
              <h3 className="font-display text-[15px] font-bold text-bone">
                {t(`howSteps.${step}Title`)}
              </h3>
              <p className="text-[13px] leading-relaxed text-bone-muted">
                {t(`howSteps.${step}Body`)}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
