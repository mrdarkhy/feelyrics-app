'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { REASON_TAGS } from '@/domain/song/reason-tag';
import { PAIR_SEPARATOR } from '@/domain/lyrics/paired-paste';
import { toBcp47 } from '@/domain/shared/language';
import type { LanguageCode, TargetLanguage } from '@/domain/shared/language';
import {
  extractBodyAction,
  loadSongBodyAction,
  saveSongBodyAction,
} from '@/actions/song-body';
import type { EditorLine, EditorSection } from '@/actions/song-body';
import { Button } from '@/components/ui/button';
import { Chip, ChipGroup } from '@/components/ui/chip';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

/**
 * The lyrics desk.
 *
 * This is the screen that decides whether the catalogue can grow. Before it, a
 * song's body could only be changed by someone with a database connection, which
 * meant every full lyric had to travel through a generated SQL file. Here the
 * maintainer pastes the words and the translation, checks the shape the
 * extractor found, and saves.
 *
 * Two things it deliberately does not do. It does not save a half-translated
 * body — an untranslated line has no honest rendering on the page, so the work
 * in progress stays in a local draft until it is finished. And it does not lift
 * the two-line cap: what it writes is the body a share link carries, not what a
 * public page shows.
 */

export interface EditorSongOption {
  slug: string;
  title: string;
  artist: string;
  source: LanguageCode;
  target: TargetLanguage;
  lineCount: number;
}

interface DraftState {
  slug: string;
  sections: EditorSection[];
  savedAt: string;
}

const DRAFT_PREFIX = 'feelyrics-body-draft:';

function readDraft(slug: string): DraftState | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + slug);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as DraftState).sections)
    ) {
      return parsed as DraftState;
    }
    return null;
  } catch {
    return null;
  }
}

function writeDraft(state: DraftState): void {
  try {
    localStorage.setItem(DRAFT_PREFIX + state.slug, JSON.stringify(state));
  } catch {
    // A full or blocked store costs the draft, never the session.
  }
}

function clearDraft(slug: string): void {
  try {
    localStorage.removeItem(DRAFT_PREFIX + slug);
  } catch {
    // Nothing to do; the draft simply outlives its usefulness.
  }
}

function countLines(sections: readonly EditorSection[]): number {
  return sections.reduce((total, section) => total + section.lines.length, 0);
}

function countUntranslated(sections: readonly EditorSection[]): number {
  return sections.reduce(
    (total, section) =>
      total + section.lines.filter((line) => line.rendering.trim().length === 0).length,
    0,
  );
}

export function LyricsEditor({ songs }: { songs: readonly EditorSongOption[] }) {
  const t = useTranslations('admin');
  const tErrors = useTranslations('errors.codes');
  const tLang = useTranslations('languages');
  const { notify } = useToast();
  const router = useRouter();

  const [slug, setSlug] = React.useState('');
  const [song, setSong] = React.useState<EditorSongOption | null>(null);
  const [sections, setSections] = React.useState<EditorSection[]>([]);
  const [paste, setPaste] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);
  const [draftFound, setDraftFound] = React.useState(false);
  const [busy, startTransition] = React.useTransition();

  const lineCount = countLines(sections);
  const untranslated = countUntranslated(sections);

  const grouped = React.useMemo(() => {
    const map = new Map<string, EditorSongOption[]>();
    for (const option of songs) {
      const key = `${option.source}→${option.target}`;
      const list = map.get(key);
      if (list) list.push(option);
      else map.set(key, [option]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [songs]);

  /** Keeps the draft current without writing on every keystroke. */
  React.useEffect(() => {
    if (!slug || sections.length === 0) return;
    const handle = setTimeout(() => {
      writeDraft({ slug, sections, savedAt: new Date().toISOString() });
    }, 800);
    return () => clearTimeout(handle);
  }, [slug, sections]);

  function selectSong(nextSlug: string) {
    setSlug(nextSlug);
    setPaste('');
    setNotice(null);
    setDraftFound(false);
    setSections([]);
    setSong(songs.find((option) => option.slug === nextSlug) ?? null);

    if (!nextSlug) return;

    startTransition(async () => {
      const result = await loadSongBodyAction(nextSlug);
      if (!result.ok) {
        notify(tErrors(result.code), 'danger');
        return;
      }

      // The asker's own paste, still held because their request is open. It goes
      // straight into the box so nobody has to go back and ask for the words.
      if (result.data.pastedLyrics) {
        setPaste(result.data.pastedLyrics);
        setNotice(t('editorPasteFromRequest'));
      }

      const draft = readDraft(nextSlug);
      if (draft) {
        setSections(draft.sections);
        setDraftFound(true);
        return;
      }

      setSections(result.data.sections);
    });
  }

  function runExtract() {
    if (!slug || paste.trim().length === 0) return;

    startTransition(async () => {
      const result = await extractBodyAction(slug, paste);
      if (!result.ok) {
        notify(tErrors(result.code), 'danger');
        return;
      }

      setSections(result.data.sections);
      setDraftFound(false);

      const parts = [
        t('editorExtracted', { lines: countLines(result.data.sections) }),
      ];
      if (result.data.paired > 0) {
        parts.push(t('editorPaired', { count: result.data.paired }));
      }
      if (result.data.carried > 0) {
        parts.push(t('editorCarried', { count: result.data.carried }));
      }
      if (result.data.discarded.length > 0) {
        parts.push(t('editorDiscarded', { count: result.data.discarded.length }));
      }
      if (result.data.inferredStructure) {
        parts.push(t('editorInferred'));
      }
      setNotice(parts.join(' · '));
    });
  }

  function patchLine(sectionIndex: number, lineIndex: number, patch: Partial<EditorLine>) {
    setSections((current) =>
      current.map((section, s) => {
        if (s !== sectionIndex) return section;
        return {
          ...section,
          lines: section.lines.map((line, l) =>
            l === lineIndex ? { ...line, ...patch } : line,
          ),
        };
      }),
    );
  }

  function patchLabel(sectionIndex: number, label: string) {
    setSections((current) =>
      current.map((section, s) => (s === sectionIndex ? { ...section, label } : section)),
    );
  }

  function save() {
    if (!slug || untranslated > 0 || lineCount === 0) return;

    startTransition(async () => {
      const result = await saveSongBodyAction(slug, sections);
      if (!result.ok) {
        notify(tErrors(result.code), 'danger');
        return;
      }

      clearDraft(slug);
      setDraftFound(false);
      notify(
        result.data.closedRequest
          ? t('editorSavedAndClosed', { lines: result.data.lineCount })
          : t('editorSaved', {
              lines: result.data.lineCount,
              before: result.data.previousLineCount,
            }),
        'success',
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="fl-surface space-y-4 p-5">
        <div className="space-y-1.5">
          <label
            htmlFor="editor-song"
            className="block text-[13px] font-semibold text-bone"
          >
            {t('editorPickSong')}
          </label>
          <select
            id="editor-song"
            value={slug}
            onChange={(event) => selectSong(event.target.value)}
            className={cn(
              'w-full rounded-xl border border-line bg-ground-raised px-3 py-2.5',
              'font-sans text-[15px] text-bone focus:border-amber/60 focus:outline-none',
            )}
          >
            <option value="">{t('editorPickPlaceholder')}</option>
            {grouped.map(([key, options]) => {
              const [source, target] = key.split('→') as [LanguageCode, TargetLanguage];
              return (
                <optgroup key={key} label={`${tLang(source)} → ${tLang(target)}`}>
                  {options.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.title} — {option.artist} · {option.lineCount}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <p className="text-[12.5px] text-olive">{t('editorPickHint')}</p>
        </div>

        {song ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Chip tone="feel">
              {tLang(song.source)} → {tLang(song.target)}
            </Chip>
            <span className="text-[13px] text-bone-muted">
              {t('editorCurrentBody', { lines: lineCount })}
            </span>
            {untranslated > 0 ? (
              <Chip tone="amber">{t('editorUntranslated', { count: untranslated })}</Chip>
            ) : null}
            {draftFound ? (
              <span className="flex items-center gap-2 text-[13px] text-amber">
                {t('editorDraftRestored')}
                <button
                  type="button"
                  onClick={() => {
                    clearDraft(slug);
                    setDraftFound(false);
                    selectSong(slug);
                  }}
                  className="underline underline-offset-2 hover:text-bone"
                >
                  {t('editorDraftDiscard')}
                </button>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {song ? (
        <div className="fl-surface space-y-3 p-5">
          <label
            htmlFor="editor-paste"
            className="block text-[13px] font-semibold text-bone"
          >
            {t('editorPasteLabel')}
          </label>
          <textarea
            id="editor-paste"
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={t('editorPastePlaceholder', { separator: PAIR_SEPARATOR })}
            className={cn(
              'w-full rounded-xl border border-line bg-ground-raised p-3',
              'font-mono text-[13px] leading-relaxed text-bone placeholder:text-olive/60',
              'focus:border-amber/60 focus:outline-none',
            )}
          />
          <p className="text-[12.5px] leading-relaxed text-olive">
            {t('editorPasteHint', { separator: PAIR_SEPARATOR })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={runExtract}
              disabled={busy || paste.trim().length === 0}
            >
              {t('editorExtract')}
            </Button>
            {notice ? <p className="text-[13px] text-patina">{notice}</p> : null}
          </div>
        </div>
      ) : null}

      {song && sections.length > 0 ? (
        <>
          <p className="rounded-card border border-line bg-panel px-4 py-3 text-[13px] leading-relaxed text-bone-muted">
            {t('editorPublicNotice')}
          </p>

          <div className="space-y-6">
            {sections.map((section, sectionIndex) => (
              <section key={sectionIndex} className="space-y-2">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`section-label-${sectionIndex}`}
                    className="text-[11px] font-semibold uppercase tracking-widest text-olive"
                  >
                    {t('editorSectionLabel')}
                  </label>
                  <input
                    id={`section-label-${sectionIndex}`}
                    value={section.label}
                    onChange={(event) => patchLabel(sectionIndex, event.target.value)}
                    lang={toBcp47(song.target)}
                    className={cn(
                      'min-w-0 flex-1 rounded-lg border border-line bg-ground-raised px-2.5 py-1.5',
                      'text-[13px] text-bone focus:border-amber/60 focus:outline-none',
                    )}
                  />
                  <span className="text-[11px] font-bold text-olive">
                    {section.lines.length}
                  </span>
                </div>

                <ul className="space-y-2">
                  {section.lines.map((line, lineIndex) => (
                    <li key={lineIndex}>
                      <EditorRow
                        line={line}
                        source={song.source}
                        target={song.target}
                        id={`line-${sectionIndex}-${lineIndex}`}
                        onChange={(patch) => patchLine(sectionIndex, lineIndex, patch)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t border-line bg-ground/95 px-1 py-4 backdrop-blur">
            <Button
              variant="primary"
              onClick={save}
              disabled={busy || untranslated > 0 || lineCount === 0}
            >
              {busy ? t('editorSaving') : t('editorSave', { lines: lineCount })}
            </Button>
            {untranslated > 0 ? (
              <p className="text-[13px] text-amber">
                {t('editorBlocked', { count: untranslated })}
              </p>
            ) : (
              <p className="text-[13px] text-olive">{t('editorReady')}</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * One line. Memoised because a body runs to a few hundred of these and every
 * keystroke would otherwise re-render all of them; the parent replaces only the
 * line object that changed, so identity does the filtering.
 */
const EditorRow = React.memo(function EditorRow({
  line,
  source,
  target,
  id,
  onChange,
}: {
  line: EditorLine;
  source: LanguageCode;
  target: TargetLanguage;
  id: string;
  onChange: (patch: Partial<EditorLine>) => void;
}) {
  const t = useTranslations('admin');
  const tTags = useTranslations('tags');
  const [open, setOpen] = React.useState(
    Boolean(line.note) || line.tags.length > 0,
  );

  const missing = line.rendering.trim().length === 0;

  return (
    <div
      className={cn(
        'rounded-xl border bg-panel p-3',
        missing ? 'border-amber/40' : 'border-line',
      )}
    >
      <p lang={toBcp47(source)} className="text-[14px] font-semibold text-bone">
        {line.original}
      </p>

      <label htmlFor={`${id}-rendering`} className="sr-only">
        {t('editorRenderingLabel')}
      </label>
      <input
        id={`${id}-rendering`}
        value={line.rendering}
        onChange={(event) => onChange({ rendering: event.target.value })}
        lang={toBcp47(target)}
        placeholder={t('editorRenderingLabel')}
        className={cn(
          'mt-1.5 w-full rounded-lg border border-line bg-ground-raised px-2.5 py-1.5',
          'text-[14px] text-bone placeholder:text-olive/60 focus:border-amber/60 focus:outline-none',
        )}
      />

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-2 text-[12px] font-semibold text-patina transition-colors hover:text-bone"
      >
        {open ? t('editorNoteHide') : t('editorNoteShow')}
      </button>

      {open ? (
        <div className="mt-2 space-y-2 border-l-2 border-line pl-3">
          <label htmlFor={`${id}-note`} className="sr-only">
            {t('editorNoteLabel')}
          </label>
          <textarea
            id={`${id}-note`}
            value={line.note ?? ''}
            onChange={(event) => onChange({ note: event.target.value })}
            rows={2}
            lang={toBcp47(target)}
            placeholder={t('editorNoteLabel')}
            className={cn(
              'w-full rounded-lg border border-line bg-ground-raised px-2.5 py-1.5',
              'text-[13px] text-bone placeholder:text-olive/60 focus:border-amber/60 focus:outline-none',
            )}
          />
          <ChipGroup
            label={t('editorTagsLabel')}
            value={line.tags}
            onValueChange={(tags) => onChange({ tags })}
            options={REASON_TAGS.map((tag) => ({
              value: tag,
              label: tTags(tag),
              description: tTags(`descriptions.${tag}`),
            }))}
          />
        </div>
      ) : null}
    </div>
  );
});
