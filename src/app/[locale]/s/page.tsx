import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SharedSongPage } from '@/components/shared/shared-song-page';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('sharedTitle'),
    description: t('sharedDescription'),
    // Nothing here is the same twice and none of it is ours to publish, so the
    // page is kept out of the index entirely.
    robots: { index: false, follow: false },
  };
}

export default async function SharedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SharedSongPage />;
}
