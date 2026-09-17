'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as TogglePrimitive from '@radix-ui/react-toggle-group';
import { toBcp47 } from '@/domain/shared/language';
import type { SongView, SharedSongView, LineView } from '@/lib/view-models';
import { saveOwnRendering, useOwnRenderings } from '@/lib/own-renderings';
import { LineRow } from './line-row';
import { ShareDialog } from './share-dialog';
import { SuggestDialog } from './suggest-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * The reading surface.
 *
 * Two controls, and both exist because of how people actually read here. The
 * order toggle: someone learning the source language wants the original on top,
 * someone being shown a song wants the translation. The notes toggle: the notes
 * are the point of the product, but on a second read-through they are in the
 * way.
 *
 * Both preferences are per-session state rather than stored settings — they
 * change with why you opened the page, not with who you are.
 */

interface SongReaderProps {
  song: SongView | SharedSongView;
  /** Absent for songs opened from a share link: they are not on this site. */
  songId?: string;
  shareUrl?: string;
  canSuggest?: boolean;
}

export function SongReader({
  song,
  songId,
  shareUrl,
  canSuggest = false,
}: SongReaderProps) {
  const t = useTranslations('song');
  const tSuggest = useTranslations('suggest');
  const tLang = useTranslations('languages');

  const [translationFirst, setTranslationFirst] = React.useState(true);
  const [showNotes, setShowNotes] = React.useState(true);
  const [suggestMode, setSuggestMode] = React.useState(false);
  const [activeLine, setActiveLine] = React.useState<LineView | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);

  // Subscribed rather than copied into state: the device's saved versions are
  // external to React, so reading them through the store keeps the server
  // render (always empty) and the client render honest about each other.
  const ownRenderings = useOwnRenderings(songId);

  const handleAccepted = React.useCallback(
    (lineId: string, rendering: string) => {
      if (songId) saveOwnRendering(songId, lineId, rendering);
    },
    [songId],
  );

  const totalLines = song.sections.reduce((n, s) => n + s.lines.length, 0);
  const isTruncated = 'truncated' in song && song.truncated;
  const isPublicDomain = 'isPublicDomain' in song && song.isPublicDomain;

  return (
    <article className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="font-display text-[clamp(1.75rem,5vw,2.5rem)] font-extrabold leading-tight text-bone">
              {song.title}
            </h1>
            <p className="text-[15px] text-bone-muted">{song.artist}</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-olive">
              <span>
                {tLang(song.source)} → {tLang(song.target)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t('engineLabel')} v{song.engineVersion}
              </span>
              {song.requestedBy ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber">
                    {t('requestedBy', { name: song.requestedBy })}
                  </span>
                </>
              ) : null}
              {'validatedBy' in song && song.validatedBy ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-feel">
                    {t('validatedBy', { name: song.validatedBy })}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {shareUrl ? (
              <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)}>
                {t('shareButton')}
              </Button>
            ) : null}
            {canSuggest && songId ? (
              <Button
                variant={suggestMode ? 'primary' : 'ghost'}
                size="sm"
                aria-pressed={suggestMode}
                onClick={() => setSuggestMode((current) => !current)}
              >
                {suggestMode ? tSuggest('disableMode') : tSuggest('enableMode')}
              </Button>
            ) : null}
          </div>
        </div>

        {song.feelProfile ? (
          <div className="rounded-card border border-amber/25 bg-amber-soft/50 px-4 py-3">
            <p className="text-[13px] leading-relaxed">
              <span className="font-semibold text-amber">{t('feelProfile')}: </span>
              <span lang={toBcp47(song.target)} className="text-bone-muted">
                {song.feelProfile}
              </span>
            </p>
          </div>
        ) : null}

        {/* The quote notice is not a disclaimer bolted on afterwards — it is the
            page explaining honestly why it is showing two lines. */}
        {isTruncated && 'totalLineCount' in song ? (
          <p className="rounded-card border border-line bg-panel px-4 py-3 text-[13px] leading-relaxed text-bone-muted">
            {t('excerptNotice', {
              shown: song.shownLineCount,
              total: song.totalLineCount,
            })}
          </p>
        ) : null}

        {isPublicDomain ? (
          <p className="text-[13px] italic text-patina">{t('publicDomainNotice')}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-y border-line py-3">
          <TogglePrimitive.Root
            type="single"
            value={translationFirst ? 'translation' : 'original'}
            onValueChange={(value) => {
              if (value) setTranslationFirst(value === 'translation');
            }}
            aria-label={t('orderToggleLabel')}
            className="inline-flex overflow-hidden rounded-pill border border-line"
          >
            <TogglePrimitive.Item
              value="translation"
              className="px-3 py-1.5 text-[12px] font-semibold text-bone-muted transition-colors data-[state=on]:bg-ground-raised data-[state=on]:text-bone"
            >
              {t('translationFirst')}
            </TogglePrimitive.Item>
            <TogglePrimitive.Item
              value="original"
              className="px-3 py-1.5 text-[12px] font-semibold text-bone-muted transition-colors data-[state=on]:bg-ground-raised data-[state=on]:text-bone"
            >
              {t('originalFirst')}
            </TogglePrimitive.Item>
          </TogglePrimitive.Root>

          <Button
            variant={showNotes ? 'ghost' : 'quiet'}
            size="sm"
            aria-pressed={showNotes}
            onClick={() => setShowNotes((current) => !current)}
            className={showNotes ? 'border-amber/45 text-amber' : undefined}
          >
            {showNotes ? t('notesOn') : t('notesOff')}
          </Button>
        </div>

        {suggestMode ? (
          <p role="status" className="text-[13px] font-medium text-amber">
            {tSuggest('modeOn')}
          </p>
        ) : null}
      </header>

      {totalLines === 0 ? (
        <p className="text-[15px] text-bone-muted">{t('noLines')}</p>
      ) : (
        <div className="space-y-8">
          {song.sections.map((section) => (
            <section key={section.id} aria-labelledby={`section-${section.id}`}>
              {section.label ? (
                <h2
                  id={`section-${section.id}`}
                  lang={toBcp47(song.target)}
                  className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-olive"
                >
                  {section.label}
                </h2>
              ) : (
                <h2 id={`section-${section.id}`} className="sr-only">
                  {t('sectionLabel')}
                </h2>
              )}

              <ul className={cn('fl-stagger space-y-4', suggestMode && 'space-y-2')}>
                {section.lines.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    source={song.source}
                    target={song.target}
                    translationFirst={translationFirst}
                    showNotes={showNotes}
                    ownRendering={ownRenderings[line.id]}
                    onSuggest={
                      suggestMode && songId
                        ? (selected) => setActiveLine(selected)
                        : undefined
                    }
                    suggestLabel={tSuggest('pickLine')}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {shareUrl ? (
        <ShareDialog url={shareUrl} open={shareOpen} onOpenChange={setShareOpen} />
      ) : null}

      {songId ? (
        <SuggestDialog
          songId={songId}
          line={activeLine}
          source={song.source}
          target={song.target}
          open={activeLine !== null}
          onOpenChange={(open) => {
            if (!open) setActiveLine(null);
          }}
          onAccepted={handleAccepted}
        />
      ) : null}
    </article>
  );
}
