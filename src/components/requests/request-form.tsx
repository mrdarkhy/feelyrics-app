'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { LANGUAGE_CODES, TARGET_LANGUAGES } from '@/domain/shared/language';
import { MAX_REQUESTER_NOTE_LENGTH } from '@/domain/request/song-request';
import { submitRequestAction } from '@/actions/requests';
import { translateNowAction } from '@/actions/translate';
import type { TranslateNowOutput } from '@/actions/translate';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Chip, ChipGroup } from '@/components/ui/chip';
import {
  Field,
  FieldHint,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from '@/components/ui/field';

/**
 * The request form.
 *
 * The lyrics box comes first, and it is no longer hidden behind a checkbox. The
 * catalogue cannot hold every song, but any song can be translated the moment
 * somebody brings its words — so the paste is not an extra the form asks for at
 * the end, it is the thing the form is for. A request without lyrics still goes
 * in; it simply waits for words nobody has brought yet.
 *
 * What happens to the paste is stated where the paste happens: it is shaped and
 * discarded. The site keeps the shape's measurements, never its words, which is
 * what lets the form ask for lyrics at all.
 */

interface Structure {
  sections: number;
  lines: number;
  repeated: number;
  dropped: number;
  inferred: boolean;
}

interface Done {
  duplicate: boolean;
  lineCount: number;
}

/**
 * Where "Translate now" is up to, one target at a time.
 *
 * Each target is its own server call, so a two-language request is two waits —
 * and the screen says which one is running rather than spinning in silence for
 * a minute.
 */
interface NowState {
  phase: 'queueing' | 'translating' | 'done';
  current: string | null;
  results: TranslateNowOutput[];
  failed: { target: string; code: string }[];
}

export function RequestForm({ queuedCount }: { queuedCount: number }) {
  const t = useTranslations('requests');
  const tLang = useTranslations('languages');
  const tErrors = useTranslations('errors.codes');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const locale = useLocale();

  const [title, setTitle] = React.useState('');
  const [artist, setArtist] = React.useState('');
  const [targets, setTargets] = React.useState<string[]>([]);
  const [alias, setAlias] = React.useState('');
  const [note, setNote] = React.useState('');
  const [lyrics, setLyrics] = React.useState('');
  const [source, setSource] = React.useState('');
  const [now, setNow] = React.useState<NowState | null>(null);

  const [structure, setStructure] = React.useState<Structure | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState<Done | null>(null);
  const [pending, startTransition] = React.useTransition();

  const checkedRef = React.useRef('');

  /**
   * Reads the paste once the person has stopped working on it.
   *
   * On blur rather than on every keystroke: the endpoint is rate-limited for
   * strangers, and a preview that costs an allowance per character would run the
   * limit out before the form was filled in.
   */
  async function checkPaste() {
    const text = lyrics.trim();
    if (text.length === 0) {
      setStructure(null);
      checkedRef.current = '';
      return;
    }
    if (text === checkedRef.current) return;

    setChecking(true);
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lyrics: text }),
      });
      const body: unknown = await response.json();

      if (
        !response.ok ||
        typeof body !== 'object' ||
        body === null ||
        !('ok' in body) ||
        body.ok !== true ||
        !('data' in body)
      ) {
        setStructure(null);
        return;
      }

      const data = body.data as {
        sections: { repeats: number }[];
        lineCount: number;
        discardedLines: string[];
        inferredStructure: boolean;
      };

      checkedRef.current = text;
      setStructure({
        sections: data.sections.length,
        lines: data.lineCount,
        repeated: data.sections.filter((section) => section.repeats > 1).length,
        dropped: data.discardedLines.length,
        inferred: data.inferredStructure,
      });
    } catch {
      // A failed preview is a missing convenience, never a blocked request:
      // the server reads the paste again on submit either way.
      setStructure(null);
    } finally {
      setChecking(false);
    }
  }

  function reset() {
    setTitle('');
    setArtist('');
    setTargets([]);
    setNote('');
    setLyrics('');
    setSource('');
    setStructure(null);
    setDone(null);
    setNow(null);
    checkedRef.current = '';
  }

  const canTranslateNow =
    lyrics.trim().length > 0 && source.length > 0 && targets.some((t) => t !== source);

  /**
   * The fast path: queue the request (so the name lands on the board), then
   * translate each target in turn and finish with the links in hand.
   */
  function handleTranslateNow() {
    setFieldErrors({});
    if (targets.length === 0) {
      setFieldErrors({ targets: tErrors('unsupported_language') });
      return;
    }
    if (source.length === 0) {
      setFieldErrors({ source: tErrors('unsupported_language') });
      return;
    }
    const wanted = targets.filter((t) => t !== source);
    if (wanted.length === 0) {
      setFieldErrors({ source: tErrors('unsupported_language') });
      return;
    }

    setNow({ phase: 'queueing', current: null, results: [], failed: [] });

    startTransition(async () => {
      const queued = await submitRequestAction({
        title,
        artist,
        targets: wanted,
        requesterAlias: alias || null,
        requesterNote: note || null,
        lyrics: lyrics.trim(),
      });

      if (!queued.ok) {
        setNow(null);
        setFieldErrors({ [queued.field ?? 'title']: tErrors(queued.code) });
        return;
      }

      const results: TranslateNowOutput[] = [];
      const failed: { target: string; code: string }[] = [];

      for (const [index, target] of wanted.entries()) {
        setNow({ phase: 'translating', current: target, results: [...results], failed: [...failed] });
        const result = await translateNowAction({
          title,
          artist,
          source,
          target,
          lyrics: lyrics.trim(),
          requesterAlias: alias || null,
          requesterNote: note || null,
          requestId: queued.data.id,
          closeRequest: index === wanted.length - 1,
          locale,
        });
        if (result.ok) results.push(result.data);
        else failed.push({ target, code: result.code });
      }

      setNow({ phase: 'done', current: null, results, failed });
      router.refresh();
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    if (targets.length === 0) {
      setFieldErrors({ targets: tErrors('unsupported_language') });
      return;
    }

    startTransition(async () => {
      const result = await submitRequestAction({
        title,
        artist,
        targets,
        requesterAlias: alias || null,
        requesterNote: note || null,
        lyrics: lyrics.trim() || null,
      });

      if (!result.ok) {
        setFieldErrors({ [result.field ?? 'title']: tErrors(result.code) });
        return;
      }

      setDone({ duplicate: result.data.duplicate, lineCount: result.data.lineCount });
      router.refresh();
    });
  }

  if (now) {
    return (
      <TranslateNowPanel
        state={now}
        title={title}
        artist={artist}
        onReset={reset}
        onQueueOnly={() => {
          setNow(null);
          setDone({ duplicate: false, lineCount: structure?.lines ?? 0 });
        }}
      />
    );
  }

  if (done) {
    return (
      <div className="fl-surface fl-enter space-y-5 p-6">
        <div className="space-y-2">
          <h2 className="font-display text-xl font-extrabold text-bone">
            {done.duplicate ? t('doneDuplicateTitle') : t('doneTitle')}
          </h2>
          <p className="text-[15px] leading-relaxed text-bone-muted">
            {done.lineCount > 0
              ? t('doneWithLyrics', { count: done.lineCount })
              : t('doneWithoutLyrics')}
          </p>
        </div>

        <ol className="space-y-2 border-l-2 border-line pl-4">
          {(['one', 'two', 'three'] as const).map((step) => (
            <li key={step} className="text-[14px] leading-relaxed text-bone-muted">
              {t(`doneNext.${step}`)}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" size="sm" onClick={reset}>
            {t('doneAnother')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="fl-surface flex flex-col gap-5 p-5">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-extrabold text-bone">
          {t('formTitle')}
        </h2>
        <p className="text-[14px] leading-relaxed text-bone-muted">{t('formLead')}</p>
      </div>

      <Field error={fieldErrors.lyrics}>
        <FieldLabel optional={tCommon('optional')}>{t('lyricsLabel')}</FieldLabel>
        <FieldHint>{t('lyricsPrivacy')}</FieldHint>
        <FieldTextarea
          value={lyrics}
          onChange={(event) => setLyrics(event.target.value)}
          onBlur={checkPaste}
          placeholder={t('lyricsPlaceholder')}
          maxLength={24000}
          rows={9}
          spellCheck={false}
        />
      </Field>

      {checking ? (
        <p className="text-[13px] text-olive">{t('structureChecking')}</p>
      ) : null}

      {structure && !checking ? (
        <div className="rounded-card border border-feel/30 bg-feel-soft p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-feel">
            {t('structureTitle')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip tone="feel">{t('structureLines', { count: structure.lines })}</Chip>
            <Chip tone="feel">
              {t('structureSections', { count: structure.sections })}
            </Chip>
            {structure.repeated > 0 ? (
              <Chip tone="neutral">
                {t('structureRepeats', { count: structure.repeated })}
              </Chip>
            ) : null}
            {structure.dropped > 0 ? (
              <Chip tone="neutral">
                {t('structureDropped', { count: structure.dropped })}
              </Chip>
            ) : null}
          </div>
          {structure.inferred ? (
            <p className="mt-2 text-[13px] leading-relaxed text-bone-muted">
              {t('structureInferred')}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={fieldErrors.title}>
          <FieldLabel>{t('titleLabel')}</FieldLabel>
          <FieldInput
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('titlePlaceholder')}
            required
            maxLength={160}
          />
        </Field>

        <Field error={fieldErrors.artist}>
          <FieldLabel>{t('artistLabel')}</FieldLabel>
          <FieldInput
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
            placeholder={t('artistPlaceholder')}
            required
            maxLength={160}
          />
        </Field>
      </div>

      <Field error={fieldErrors.source}>
        <FieldLabel>{t('sourceLabel')}</FieldLabel>
        <FieldHint>{t('sourceHint')}</FieldHint>
        <SourceSelect value={source} onChange={setSource} placeholder={t('sourcePlaceholder')} />
      </Field>

      <Field error={fieldErrors.targets}>
        <FieldLabel>{t('targetsLabel')}</FieldLabel>
        <FieldHint>{t('targetsHint')}</FieldHint>
        <ChipGroup
          label={t('targetsLabel')}
          value={targets}
          onValueChange={setTargets}
          options={TARGET_LANGUAGES.map((code) => ({
            value: code,
            label: tLang(code),
          }))}
        />
      </Field>

      <Field>
        <FieldLabel optional={tCommon('optional')}>{t('noteLabel')}</FieldLabel>
        <FieldHint>{t('noteHint')}</FieldHint>
        <FieldTextarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('notePlaceholder')}
          maxLength={MAX_REQUESTER_NOTE_LENGTH}
          rows={2}
        />
      </Field>

      <Field>
        <FieldLabel optional={tCommon('optional')}>{t('aliasLabel')}</FieldLabel>
        <FieldInput
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
          placeholder={t('aliasPlaceholder')}
          maxLength={60}
          autoComplete="nickname"
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-olive">
          {lyrics.trim().length > 0
            ? canTranslateNow
              ? t('submitHintNow')
              : t('submitHintWithLyrics')
            : t('submitHintWithoutLyrics', { count: queuedCount })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant={canTranslateNow ? 'secondary' : 'primary'} loading={pending}>
            {pending ? t('submitting') : t('submit')}
          </Button>
          {lyrics.trim().length > 0 ? (
            <Button
              type="button"
              variant="primary"
              disabled={!canTranslateNow || pending}
              onClick={handleTranslateNow}
            >
              {t('translateNow')}
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function SourceSelect({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const tLang = useTranslations('languages');
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'w-full rounded-xl border border-line bg-ground-raised px-3 py-2.5',
        'font-sans text-[15px] text-bone focus:border-amber/60 focus:outline-none',
        value.length === 0 && 'text-olive/70',
      )}
    >
      <option value="">{placeholder}</option>
      {LANGUAGE_CODES.map((code) => (
        <option key={code} value={code}>
          {tLang(code)}
        </option>
      ))}
    </select>
  );
}

/**
 * The fast path's screen: first the wait, then the links.
 *
 * The wait is narrated per target because it is long enough to doubt — a
 * minute of spinner reads as broken; "Turkish version, 40 lines, writing the
 * notes" reads as work. The result puts the full-song link first: it is the
 * thing the person came for, and the one they will send to whoever is waiting.
 */
function TranslateNowPanel({
  state,
  title,
  artist,
  onReset,
  onQueueOnly,
}: {
  state: NowState;
  title: string;
  artist: string;
  onReset: () => void;
  onQueueOnly: () => void;
}) {
  const t = useTranslations('requests');
  const tLang = useTranslations('languages');
  const tErrors = useTranslations('errors.codes');
  const tShare = useTranslations('share');
  const [copied, setCopied] = React.useState<string | null>(null);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
    } catch {
      setCopied(null);
    }
  }

  if (state.phase !== 'done') {
    return (
      <div className="fl-surface fl-enter space-y-4 p-6" role="status" aria-live="polite">
        <h2 className="font-display text-xl font-extrabold text-bone">
          {t('nowWorkingTitle', { title, artist })}
        </h2>
        <p className="text-[15px] leading-relaxed text-bone-muted">
          {state.phase === 'queueing'
            ? t('nowQueueing')
            : t('nowTranslating', { language: tLang(state.current ?? 'en') })}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-ground-raised">
          <div className="fl-progress h-full w-1/3 rounded-pill bg-amber" />
        </div>
        <p className="text-[13px] text-olive">{t('nowPatience')}</p>
      </div>
    );
  }

  const allFailed = state.results.length === 0;

  return (
    <div className="fl-surface fl-enter space-y-5 p-6">
      <div className="space-y-2">
        <h2 className="font-display text-xl font-extrabold text-bone">
          {allFailed ? t('nowFailedTitle') : t('nowDoneTitle')}
        </h2>
        <p className="text-[15px] leading-relaxed text-bone-muted">
          {allFailed ? t('nowFailedBody') : t('nowDoneBody')}
        </p>
      </div>

      <ul className="space-y-3">
        {state.results.map((result) => (
          <li key={result.slug} className="rounded-card border border-line bg-panel p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-feel">
              {tLang(result.target)} · {t('linesReady', { count: result.lineCount })}
              {result.existing ? ` · ${t('nowExisting')}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.shareUrl ? (
                <Button asChild variant="primary" size="sm">
                  <a href={result.shareUrl}>{t('nowOpenFull')}</a>
                </Button>
              ) : null}
              {result.shareUrl ? (
                <Button variant="secondary" size="sm" onClick={() => copy(result.shareUrl ?? '')}>
                  {copied === result.shareUrl ? tShare('copied') : t('nowCopyLink')}
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="sm">
                <Link href={`/songs/${result.slug}`}>{t('nowOpenPage')}</Link>
              </Button>
            </div>
          </li>
        ))}
        {state.failed.map((failure) => (
          <li
            key={failure.target}
            className="rounded-card border border-danger/40 bg-panel p-4 text-[14px] text-bone-muted"
          >
            <span className="font-semibold text-bone">{tLang(failure.target)}:</span>{' '}
            {tErrors(failure.code)}
          </li>
        ))}
      </ul>

      <p className="text-[13px] leading-relaxed text-olive">{t('nowDraftNotice')}</p>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="sm" onClick={onReset}>
          {t('doneAnother')}
        </Button>
        {allFailed ? (
          <Button variant="ghost" size="sm" onClick={onQueueOnly}>
            {t('nowLeaveInQueue')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
