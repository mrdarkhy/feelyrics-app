import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { RequestView } from '@/lib/view-models';
import type { RequestStatus } from '@/domain/request/song-request';
import { Chip } from '@/components/ui/chip';

/**
 * The public queue.
 *
 * Showing what is waiting, and who asked, is what turns a backlog into a reason
 * to come back: the asker's name stays on the row and then on the song. A ready
 * row is a link, because the payoff for asking should be one tap away.
 */

const TONES: Record<RequestStatus, 'feel' | 'amber' | 'muted' | 'neutral'> = {
  ready: 'feel',
  queued: 'amber',
  'lyrics-needed': 'muted',
  declined: 'neutral',
};

export function RequestQueue({ requests }: { requests: readonly RequestView[] }) {
  const t = useTranslations('requests');
  const tLang = useTranslations('languages');

  if (requests.length === 0) {
    return (
      <div className="fl-surface px-5 py-10 text-center">
        <p className="text-[15px] text-bone-muted">{t('empty')}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {requests.map((request) => {
        const meta = [
          request.artist,
          t('into', {
            languages: request.targets.map((code) => tLang(code)).join(' + '),
          }),
          request.requesterAlias ? t('for', { name: request.requesterAlias }) : null,
        ]
          .filter(Boolean)
          .join(' · ');

        const badge = (
          <Chip tone={TONES[request.status]} className="shrink-0">
            {t(`status.${request.status}`)}
          </Chip>
        );

        const body = (
          <div className="flex w-full items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-bold text-bone">
                {request.title}
              </p>
              <p className="text-[13px] leading-snug text-bone-muted">{meta}</p>
            </div>
            {badge}
          </div>
        );

        return (
          <li key={request.id}>
            {request.status === 'ready' && request.songSlug ? (
              <Link
                href={`/songs/${request.songSlug}`}
                aria-label={`${request.title} — ${t('openResult')}`}
                className="fl-card flex rounded-card border border-line bg-panel p-4 transition-colors hover:border-feel/40 hover:bg-ground-raised"
              >
                {body}
              </Link>
            ) : (
              <div className="fl-card flex rounded-card border border-line bg-panel/60 p-4">
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
