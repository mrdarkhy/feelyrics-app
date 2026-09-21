'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toBcp47 } from '@/domain/shared/language';
import type { LanguageCode, TargetLanguage } from '@/domain/shared/language';
import type { LineView } from '@/lib/view-models';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/cn';

export interface LineRowProps {
  line: LineView;
  source: LanguageCode;
  target: TargetLanguage;
  translationFirst: boolean;
  showNotes: boolean;
  /** The reader's own version, held on their device. */
  ownRendering?: string;
  /** Present when the line can be suggested on. */
  onSuggest?: (line: LineView) => void;
  suggestLabel?: string;
  /** The line being sung right now, when the song is playing in sync. */
  active?: boolean;
}

/**
 * One lyric line, in both languages, with the reasoning underneath.
 *
 * `lang` is set on each half so a screen reader switches voice between the
 * original and the translation — without it, Spanish read in a Turkish voice is
 * unintelligible, which defeats the point of the whole page.
 *
 * In suggest mode the row becomes a real `<button>`. Not a div with a click
 * handler: it has to be reachable by keyboard and announced as an action.
 */
export const LineRow = React.memo(function LineRow({
  line,
  source,
  target,
  translationFirst,
  showNotes,
  ownRendering,
  onSuggest,
  suggestLabel,
  active = false,
}: LineRowProps) {
  const t = useTranslations('player');
  const tTags = useTranslations('tags');
  const ref = React.useRef<HTMLLIElement>(null);

  // The sung line stays in view without the reader scrolling: centred, and
  // only when it changes, so a paused song does not keep tugging the page.
  React.useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active]);

  const rendering = ownRendering ?? line.rendering;
  const primary = translationFirst ? rendering : line.original;
  const secondary = translationFirst ? line.original : rendering;
  const primaryLang = translationFirst ? target : source;
  const secondaryLang = translationFirst ? source : target;

  const body = (
    <>
      <p
        lang={toBcp47(primaryLang)}
        className="font-display text-[clamp(1.25rem,3.4vw,1.75rem)] font-extrabold leading-[1.25] text-bone"
      >
        {primary}
      </p>
      <p lang={toBcp47(secondaryLang)} className="mt-1 text-[14px] leading-snug text-patina">
        {secondary}
      </p>

      {ownRendering ? (
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-widest text-feel">
          {t('yourFit')}
        </p>
      ) : null}

      {showNotes && line.note ? (
        <div className="mt-3 border-l-2 border-patina/40 pl-3">
          {/* The note is written in the target language — it is addressed to the
              reader of the translation, not to the interface. */}
          <p lang={toBcp47(target)} className="text-[13px] italic leading-relaxed text-bone-muted">
            {line.note}
          </p>
          {line.tags.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {line.tags.map((tag) => (
                <li key={tag}>
                  <Chip tone="neutral" title={tTags(`descriptions.${tag}`)}>
                    {tTags(tag)}
                  </Chip>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (onSuggest) {
    return (
      <li ref={ref} data-lyric-line={line.id} data-active={active || undefined}>
        <button
          type="button"
          onClick={() => onSuggest(line)}
          aria-label={`${suggestLabel}: ${line.original}`}
          className={cn(
            'w-full rounded-xl border border-transparent p-3 text-left transition-colors',
            'hover:border-amber/40 hover:bg-amber-soft/40',
            active && 'border-feel/50 bg-feel-soft/50',
          )}
        >
          {body}
        </button>
      </li>
    );
  }

  return (
    <li
      ref={ref}
      data-lyric-line={line.id}
      data-active={active || undefined}
      className={cn(
        'rounded-xl border border-transparent p-3 transition-colors duration-300',
        active && 'border-feel/50 bg-feel-soft/50',
      )}
    >
      {body}
    </li>
  );
});
