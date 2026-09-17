import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { SongSummaryView } from '@/lib/view-models';
import { Chip } from '@/components/ui/chip';

/**
 * A shelf: a short, editorially chosen row of songs.
 *
 * The rail answers "find the one I want". A shelf answers the other question —
 * "I do not know what I want, show me something" — and it answers it with the
 * feel profile rather than the title, because the feel is the thing this site
 * has that the lyrics sites do not.
 */
export function SongShelf({
  songs,
  headingId,
}: {
  songs: readonly SongSummaryView[];
  headingId: string;
}) {
  const t = useTranslations('library');
  const tLang = useTranslations('languages');

  if (songs.length === 0) return null;

  return (
    <ul
      aria-labelledby={headingId}
      className="fl-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {songs.map((song) => (
        <li key={song.slug}>
          <Link
            href={`/songs/${song.slug}`}
            data-shelf-link={song.slug}
            className="fl-card group flex h-full flex-col gap-2 rounded-card border border-line bg-panel p-4 transition-colors hover:border-line-strong hover:bg-ground-raised"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-feel">
              {tLang(song.source)} → {tLang(song.target)}
            </span>

            <span className="font-display text-[17px] font-extrabold leading-tight text-bone group-hover:text-amber">
              {song.title}
            </span>
            <span className="text-[13px] text-patina">{song.artist}</span>

            {song.feelProfile ? (
              <span
                lang={song.target}
                className="mt-1 line-clamp-2 text-[12.5px] italic leading-relaxed text-bone-muted"
              >
                {song.feelProfile}
              </span>
            ) : null}

            {song.validatedBy ? (
              <span className="mt-auto pt-2">
                <Chip tone="feel">{t('validatedBadge')}</Chip>
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
