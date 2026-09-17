import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/infrastructure/container';
import { listQueue, weeklyRequestCount } from '@/application/use-cases/requests';
import { toRequestView } from '@/lib/view-models';
import { RequestForm } from '@/components/requests/request-form';
import { RequestQueue } from '@/components/requests/request-queue';

/**
 * The queue is live data: somebody posts a request and expects to see it in the
 * list a second later. Prerendered, this page would serve whatever the queue
 * happened to hold at build time until the next deploy — and `router.refresh()`
 * after a submit would cheerfully hand back that same frozen payload.
 */
export const dynamic = 'force-dynamic';

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

  const views = requests.map(toRequestView);
  const ready = views.filter((request) => request.status === 'ready').length;
  const queued = views.filter((request) => request.status === 'queued').length;
  const waiting = views.filter((request) => request.status === 'lyrics-needed').length;

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <h1 className="font-display text-[clamp(1.9rem,5.5vw,2.9rem)] font-extrabold leading-[1.06] text-bone">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-[16px] leading-relaxed text-bone-muted">
          {t('subtitle')}
        </p>

        {/* The counts are the argument: this is a queue that moves. */}
        <dl className="flex flex-wrap gap-x-8 gap-y-3 border-y border-line py-4">
          <Stat label={t('statTranslated')} value={ready} tone="feel" />
          <Stat label={t('statQueued')} value={queued} tone="amber" />
          <Stat label={t('statWaiting')} value={waiting} tone="muted" />
          <Stat label={t('statThisWeek')} value={weekly} tone="muted" />
        </dl>
      </header>

      <RequestForm queuedCount={queued} />

      <section aria-labelledby="queue-heading" className="space-y-4">
        <h2 id="queue-heading" className="font-display text-xl font-extrabold text-bone">
          {t('queueTitle')}
        </h2>
        <RequestQueue requests={views} />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'feel' | 'amber' | 'muted';
}) {
  const colour =
    tone === 'feel' ? 'text-feel' : tone === 'amber' ? 'text-amber' : 'text-bone';

  return (
    // `dt` before `dd` in the markup, reversed for the eye: the number reads
    // first, and the document stays a valid description list.
    <div className="flex flex-col-reverse gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-olive">
        {label}
      </dt>
      <dd className={`font-display text-[26px] font-extrabold tabular-nums ${colour}`}>
        {value}
      </dd>
    </div>
  );
}
