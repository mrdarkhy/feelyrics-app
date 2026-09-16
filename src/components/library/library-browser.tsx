'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { groupingLanguage } from '@/domain/shared/language';
import type { LanguageCode, TargetLanguage } from '@/domain/shared/language';
import { TARGET_LANGUAGES } from '@/domain/shared/language';
import type { SongSummaryView } from '@/lib/view-models';
import { Chip, SingleChipGroup } from '@/components/ui/chip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';

/**
 * The library.
 *
 * Filtering happens in the browser over a list the server already sent. The
 * whole catalogue is a few dozen songs, so a round trip per keystroke would buy
 * nothing and cost the instant feel that makes searching worth doing. If the
 * catalogue ever outgrows that, this is the component that moves to server-side
 * filtering — nothing else has to change.
 */

const ALL = 'all';

export function LibraryBrowser({ songs }: { songs: readonly SongSummaryView[] }) {
  const t = useTranslations('library');
  const tLang = useTranslations('languages');

  const [query, setQuery] = React.useState('');
  const [target, setTarget] = React.useState<string>(ALL);
  const [source, setSource] = React.useState<string>(ALL);

  const sourceOptions = React.useMemo(() => {
    const present = new Set<LanguageCode>();
    for (const song of songs) present.add(groupingLanguage(song.source));
    return [...present].sort((a, b) => tLang(a).localeCompare(tLang(b)));
  }, [songs, tLang]);

  const targetOptions = React.useMemo(() => {
    const present = new Set<TargetLanguage>(songs.map((song) => song.target));
    return TARGET_LANGUAGES.filter((code) => present.has(code));
  }, [songs]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();

    return songs.filter((song) => {
      if (target !== ALL && song.target !== target) return false;
      if (source !== ALL && groupingLanguage(song.source) !== source) return false;
      if (needle.length === 0) return true;
      return `${song.title} ${song.artist}`.toLocaleLowerCase().includes(needle);
    });
  }, [songs, query, target, source]);

  const groups = React.useMemo(() => {
    const map = new Map<string, SongSummaryView[]>();
    for (const song of filtered) {
      const key = `${groupingLanguage(song.source)}→${song.target}`;
      const existing = map.get(key);
      if (existing) existing.push(song);
      else map.set(key, [song]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="fl-surface space-y-4 p-4" role="search">
        <div className="relative">
          <label htmlFor="library-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <input
            id="library-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            className={cn(
              'w-full rounded-xl border border-line bg-ground-raised py-2.5 pl-10 pr-3',
              'text-[15px] text-bone placeholder:text-olive/70',
              'focus:border-amber/60 focus:outline-none',
            )}
          />
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-olive"
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-olive">
              {t('intoLabel')}
            </span>
            <SingleChipGroup
              label={t('intoLabel')}
              value={target}
              onValueChange={setTarget}
              options={[
                { value: ALL, label: t('allTargets') },
                ...targetOptions.map((code) => ({
                  value: code,
                  label: tLang(code),
                })),
              ]}
            />
          </div>

          <div className="flex items-center gap-2 sm:w-56">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-olive">
              {t('fromLabel')}
            </span>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger aria-label={t('fromLabel')} className="h-9 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('anySource')}</SelectItem>
                {sourceOptions.map((code) => (
                  <SelectItem key={code} value={code}>
                    {tLang(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Filtering happens without a page load, so the result count has to be
          announced or a screen-reader user never learns the list changed. */}
      <p aria-live="polite" className="sr-only">
        {t('resultsAnnouncement', { count: filtered.length })}
      </p>

      {groups.length === 0 ? (
        <div className="fl-surface px-5 py-12 text-center">
          <p className="font-display text-lg font-extrabold text-bone">{t('empty')}</p>
          <p className="mt-2 text-[14px] text-bone-muted">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([key, items]) => {
            const [groupSource, groupTarget] = key.split('→') as [
              LanguageCode,
              TargetLanguage,
            ];
            return (
              <section key={key} aria-labelledby={`group-${key}`}>
                <h2
                  id={`group-${key}`}
                  className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-olive"
                >
                  {t('groupHeading', {
                    source: tLang(groupSource),
                    target: tLang(groupTarget),
                  })}
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {items.map((song) => (
                    <li key={song.slug}>
                      <SongCard song={song} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SongCard({ song }: { song: SongSummaryView }) {
  const t = useTranslations('library');
  const tLang = useTranslations('languages');

  return (
    <Link
      href={`/songs/${song.slug}`}
      className={cn(
        'fl-card group flex h-full flex-col gap-2 rounded-card border border-line bg-panel p-4',
        'transition-colors hover:border-line-strong hover:bg-ground-raised',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-bold text-bone group-hover:text-amber">
            {song.title}
          </p>
          <p className="truncate text-[13px] text-bone-muted">{song.artist}</p>
        </div>
        <Chip tone="neutral" className="shrink-0">
          {tLang(song.source)} → {tLang(song.target)}
        </Chip>
      </div>

      {song.feelProfile ? (
        // Content, not chrome: the feel profile is written in the song's target
        // language, so it is tagged with that language rather than the UI's.
        <p lang={song.target} className="line-clamp-2 text-[13px] italic text-patina">
          {song.feelProfile}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {song.validatedBy ? <Chip tone="feel">{t('validatedBadge')}</Chip> : null}
        {song.requestedBy ? <Chip tone="amber">{t('requestedByBadge')}</Chip> : null}
      </div>
    </Link>
  );
}
