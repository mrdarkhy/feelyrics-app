import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/infrastructure/container';
import { listQueue, weeklyRequestCount } from '@/application/use-cases/requests';
import { toRequestView } from '@/lib/view-models';
import { RequestForm } from '@/components/requests/request-form';
import { RequestQueue } from '@/components/requests/request-queue';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('requestsTitle'),
    description: t('requestsDescription'),
    alternates: { canonical: `/${locale}/requests` },
  };
}

export default async function RequestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'requests' });
  const container = getContainer();

  const [requests, weekly] = await Promise.all([
    listQueue(container),
    weeklyRequestCount(container),
  ]);

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-display text-[clamp(1.75rem,5vw,2.5rem)] font-extrabold text-bone">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-bone-muted">
          {t('subtitle')}
        </p>
        <p className="text-[13px] text-olive">{t('weeklyCount', { count: weekly })}</p>
      </header>

      <RequestForm />

      <section aria-labelledby="queue-heading" className="space-y-4">
        <h2 id="queue-heading" className="font-display text-xl font-extrabold text-bone">
          {t('queueTitle')}
        </h2>
        <RequestQueue requests={requests.map(toRequestView)} />
      </section>
    </div>
  );
}
