'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { groupingLanguage, TARGET_LANGUAGES } from '@/domain/shared/language';
import type { LanguageCode, TargetLanguage } from '@/domain/shared/language';
import { pairSlug } from '@/lib/pairs';
import type { SongSummaryView } from '@/lib/view-models';
import { SingleChipGroup } from '@/components/ui/chip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';

/**
 * The rail: the whole catalogue, permanently to hand.
 *
 * It lives in the layout rather than in a page, which is the entire point —
 * opening a song swaps the pane beside it and leaves this untouched, so the
 * filters you set and the place you had scrolled to are still there when you
 * come back. A list that resets itself every time you read something is a list
 * you stop browsing.
 *
 * Filtering runs in the browser over a list the server already sent. Sixty-odd
 * songs is nothing; a round trip per keystroke would buy accuracy nobody needs
 * and cost the instant feel that makes searching worth doing. The day the
 * catalogue outgrows that, this is the one component that has to change.
 */

const ALL = 'all';

type SortKey = 'pair' | 'newest' | 'title';

const SORT_KEYS: readonly SortKey[] = ['pair', 'newest', 'title'];

export interface LibraryRailProps {
  songs: readonly SongSummaryView[];
  /** The song currently open in the pane, if any. */
  activeSlug: string | null;
}

export function LibraryRail({ songs, activeSlug }: LibraryRailProps) {
  const t = useTranslations('library');
  const tLang = useTranslations('languages');

  const [query, setQuery] = React.useState('');
  const [target, setTarget] = React.useState<string>(ALL);
  const [source, setSource] = React.useState<string>(ALL);
  const [sort, setSort] = React.useState<SortKey>('pair');

  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  /**
   * Arriving straight at a song — from a search result, a shared link — should
   * not leave its row somewhere off the bottom of a list of sixty. `nearest`
   * does nothing when the row is already visible, so clicking around never
   * causes a jump.
   */
  React.useEffect(() => {
    if (!activeSlug) return;
    const row = listRef.current?.querySelector(`[data-song-link="${activeSlug}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeSlug]);

  /**
   * `/` jumps to the search box, the convention every catalogue on the web has
   * settled on. Guarded against firing while someone is already typing
   * somewhere, which is the way this shortcut usually goes wrong.
   */
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;

      const target_ = event.target;
      if (target_ instanceof HTMLElement) {
        const tag = target_.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target_.isContentEditable) return;
      }

      const input = searchRef.current;
      if (!input) return;

      event.preventDefault();
      input.focus();
      input.select();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const matchesQuery = React.useCallback(
    (song: SongSummaryView, needle: string) => {
      if (needle.length === 0) return true;
      // The feel profile is searchable on purpose: "melancholy" is a truer way
      // to look for a song than half-remembering its title.
      return `${song.title} ${song.artist} ${song.feelProfile ?? ''}`
        .toLocaleLowerCase()
        .includes(needle);
    },
    [],
  );

  const needle = query.trim().toLocaleLowerCase();

  /**
   * Facet counts ignore the facet they belong to and honour every other filter,
   * so a count always answers "how many would I get if I clicked this" rather
   * than "how many are on screen right now".
   */
  const targetCounts = React.useMemo(() => {
    const counts = new Map<TargetLanguage, number>();
    for (const song of songs) {
      if (source !== ALL && groupingLanguage(song.source) !== source) continue;
      if (!matchesQuery(song, needle)) continue;
      counts.set(song.target, (counts.get(song.target) ?? 0) + 1);
    }
    return counts;
  }, [songs, source, needle, matchesQuery]);

  const sourceCounts = React.useMemo(() => {
    const counts = new Map<LanguageCode, number>();
    for (const song of songs) {
      if (target !== ALL && song.target !== target) continue;
      if (!matchesQuery(song, needle)) continue;
      const code = groupingLanguage(song.source);
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return counts;
  }, [songs, target, needle, matchesQuery]);

  const totalForQuery = React.useMemo(
    () => songs.filter((song) => matchesQuery(song, needle)).length,
    [songs, needle, matchesQuery],
  );

  const filtered = React.useMemo(() => {
    const rows = songs.filter((song) => {
      if (target !== ALL && song.target !== target) return false;
      if (source !== ALL && groupingLanguage(song.source) !== source) return false;
      return matchesQuery(song, needle);
    });

    if (sort === 'newest') {
      // ISO-8601 sorts lexicographically, so this is a date comparison without
      // parsing sixty-odd strings into Date objects on every keystroke.
      return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    if (sort === 'title') {
      return [...rows].sort((a, b) => a.title.localeCompare(b.title));
    }

    return rows;
  }, [songs, target, source, needle, sort, matchesQuery]);

  const groups = React.useMemo(() => {
    if (sort !== 'pair') return [];

    const map = new Map<string, SongSummaryView[]>();
    for (const song of filtered) {
      const key = `${groupingLanguage(song.source)}→${song.target}`;
      const existing = map.get(key);
      if (existing) existing.push(song);
      else map.set(key, [song]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, sort]);

  const sourceOptions = React.useMemo(() => {
    const present = new Set<LanguageCode>();
    for (const song of songs) present.add(groupingLanguage(song.source));
    return [...present].sort((a, b) => tLang(a).localeCompare(tLang(b)));
  }, [songs, tLang]);

  const targetOptions = React.useMemo(() => {
    const present = new Set<TargetLanguage>(songs.map((song) => song.target));
    return TARGET_LANGUAGES.filter((code) => present.has(code));
  }, [songs]);

  const hasFilters = query.length > 0 || target !== ALL || source !== ALL;

  function clearAll() {
    setQuery('');
    setTarget(ALL);
    setSource(ALL);
  }

  return (
    <div className="flex flex-col lg:h-full">
      <div className="shrink-0 space-y-3 border-b border-line px-4 py-4" role="search">
        <div className="relative">
          <label htmlFor="library-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <input
            id="library-search"
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            className={cn(
              'w-full rounded-xl border border-line bg-ground-raised py-2.5 pl-10 pr-12',
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
            <path
              d="m11 11 3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          {/* Decoration for the shortcut that already exists; the keyboard user
              who benefits does not need it announced twice. */}
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold text-olive lg:block"
          >
            /
          </kbd>
        </div>

        <div className="space-y-2">
          <span className="block text-[11px] font-semibold uppercase tracking-widest text-olive">
            {t('intoLabel')}
          </span>
          <SingleChipGroup
            label={t('intoLabel')}
            value={target}
            onValueChange={setTarget}
            options={[
              { value: ALL, label: `${t('allTargets')} ${totalForQuery}` },
              ...targetOptions.map((code) => ({
                value: code,
                label: `${tLang(code)} ${targetCounts.get(code) ?? 0}`,
              })),
            ]}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-olive">
            {t('fromLabel')}
          </span>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger aria-label={t('fromLabel')} className="h-9 flex-1 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('anySource')}</SelectItem>
              {sourceOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {`${tLang(code)} · ${sourceCounts.get(code) ?? 0}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-olive">
            {t('sortLabel')}
          </span>
          <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
            <SelectTrigger aria-label={t('sortLabel')} className="h-9 flex-1 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`sort.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="text-[12px] font-semibold text-olive">
          {t('resultCount', { count: filtered.length })}
        </span>

        {query.length > 0 ? (
          <FilterChip
            label={t('filterQuery', { query: query.trim() })}
            removeLabel={t('removeFilter', { label: query.trim() })}
            onRemove={() => setQuery('')}
          />
        ) : null}
        {target !== ALL ? (
          <FilterChip
            label={t('filterInto', { language: tLang(target) })}
            removeLabel={t('removeFilter', { label: tLang(target) })}
            onRemove={() => setTarget(ALL)}
          />
        ) : null}
        {source !== ALL ? (
          <FilterChip
            label={t('filterFrom', { language: tLang(source) })}
            removeLabel={t('removeFilter', { label: tLang(source) })}
            onRemove={() => setSource(ALL)}
          />
        ) : null}
        {hasFilters ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-[12px] font-semibold text-patina underline-offset-2 hover:text-bone hover:underline"
          >
            {t('clearAll')}
          </button>
        ) : null}
      </div>

      {/* Filtering happens without a page load, so the new count has to be
          announced or a screen-reader user never learns the list changed. */}
      <p aria-live="polite" className="sr-only">
        {t('resultsAnnouncement', { count: filtered.length })}
      </p>

      <div ref={listRef} className="px-2 pb-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="font-display text-[15px] font-extrabold text-bone">
              {t('empty')}
            </p>
            <p className="mt-2 text-[13px] text-bone-muted">{t('emptyHint')}</p>
          </div>
        ) : sort === 'pair' ? (
          <div className="space-y-4">
            {groups.map(([key, items]) => {
              const [groupSource, groupTarget] = key.split('→') as [
                LanguageCode,
                TargetLanguage,
              ];
              return (
                <section key={key} aria-labelledby={`rail-group-${key}`}>
                  <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                    <h2
                      id={`rail-group-${key}`}
                      className="text-[11px] font-semibold uppercase tracking-[0.16em] text-olive"
                    >
                      {t('groupHeading', {
                        source: tLang(groupSource),
                        target: tLang(groupTarget),
                      })}
                    </h2>
                    <span className="h-px flex-1 bg-line" />
                    {/* The pair page is a real destination, not a filter state:
                        it is what a search engine can reach and rank. */}
                    <Link
                      href={`/pairs/${pairSlug({ source: groupSource, target: groupTarget })}`}
                      className="text-[11px] font-bold text-olive transition-colors hover:text-amber"
                    >
                      {items.length}
                    </Link>
                  </div>
                  <ul>
                    {items.map((song) => (
                      <li key={song.slug}>
                        <RailRow song={song} active={song.slug === activeSlug} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <ul className="pt-2">
            {filtered.map((song) => (
              <li key={song.slug}>
                <RailRow song={song} active={song.slug === activeSlug} showPair />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-amber-soft py-0.5 pl-2.5 pr-1 text-[12px] font-semibold text-amber">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="grid size-5 place-items-center rounded-pill transition-colors hover:bg-amber/20"
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path
            d="M1 1l8 8M9 1L1 9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}

function RailRow({
  song,
  active,
  showPair = false,
}: {
  song: SongSummaryView;
  active: boolean;
  showPair?: boolean;
}) {
  const t = useTranslations('library');
  const tLang = useTranslations('languages');

  return (
    <Link
      href={`/songs/${song.slug}`}
      data-song-link={song.slug}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'fl-rail-row block rounded-xl py-2.5 pl-4 pr-3 transition-colors',
        active ? 'bg-elevated' : 'hover:bg-ground-raised',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-display text-[14px] font-bold',
            active ? 'text-amber' : 'text-bone',
          )}
        >
          {song.title}
        </span>
        {song.validatedBy ? (
          <span
            title={t('validatedBadge')}
            className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-feel"
          >
            <span className="sr-only">{t('validatedBadge')}</span>
          </span>
        ) : null}
        {showPair ? (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-olive">
            {song.source}→{song.target}
          </span>
        ) : null}
      </div>

      <span className="block truncate text-[12.5px] text-patina">{song.artist}</span>

      {song.feelProfile ? (
        // Content, not chrome: a feel profile is written in the song's target
        // language, so it carries that language rather than the interface's.
        <span
          lang={song.target}
          className="mt-0.5 block truncate text-[12px] italic text-bone-muted/75"
        >
          {song.feelProfile}
        </span>
      ) : null}

      <span className="sr-only">
        {t('openSong', { title: song.title })} — {tLang(song.source)} →{' '}
        {tLang(song.target)}
      </span>
    </Link>
  );
}
