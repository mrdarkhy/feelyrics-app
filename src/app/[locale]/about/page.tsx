import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('aboutTitle'),
    description: t('aboutDescription'),
    alternates: { canonical: `/${locale}/about` },
  };
}

const SECTIONS = ['lead', 'answer', 'rights', 'community'] as const;

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'about' });

  return (
    <article className="mx-auto max-w-2xl space-y-10">
      <h1 className="font-display text-[clamp(1.75rem,5vw,2.5rem)] font-extrabold text-bone">
        {t('title')}
      </h1>

      {SECTIONS.map((section) => (
        <section key={section} className="space-y-3">
          <h2 className="font-display text-xl font-extrabold text-bone">
            {t(`${section}Title`)}
          </h2>
          <p className="text-[16px] leading-relaxed text-bone-muted">
            {t(`${section}Body`)}
          </p>
        </section>
      ))}

      <p className="border-t border-line pt-6 text-[14px] italic text-olive">
        {t('contact')}
      </p>
    </article>
  );
}
