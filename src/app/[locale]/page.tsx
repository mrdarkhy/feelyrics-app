import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getContainer } from '@/infrastructure/container';
import { listSongs } from '@/application/use-cases/songs';
import { toSongSummaryView } from '@/lib/view-models';
import { LibraryBrowser } from '@/components/library/library-browser';
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

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'home' });
  const tLibrary = await getTranslations({ locale, namespace: 'library' });

  const summaries = await listSongs(getContainer());
  const songs = summaries.map(toSongSummaryView);
  const pairCount = new Set(songs.map((song) => `${song.source}${song.target}`)).size;

  return (
    <div className="space-y-12">
      <section className="space-y-5">
        <h1 className="max-w-3xl font-display text-[clamp(2rem,6vw,3.25rem)] font-extrabold leading-[1.08] text-bone">
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
            {t('statsPairs', { count: pairCount })}
          </p>
        </div>
      </section>

      <section aria-labelledby="library-heading" className="space-y-5">
        <h2
          id="library-heading"
          className="font-display text-xl font-extrabold text-bone"
        >
          {tLibrary('title')}
        </h2>
        <LibraryBrowser songs={songs} />
      </section>

      <section aria-labelledby="how-heading" className="space-y-5">
        <h2 id="how-heading" className="font-display text-xl font-extrabold text-bone">
          {t('howTitle')}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
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
