'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { TARGET_LANGUAGES } from '@/domain/shared/language';
import { MAX_REQUESTER_NOTE_LENGTH } from '@/domain/request/song-request';
import { submitRequestAction } from '@/actions/requests';
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

export function RequestForm({ queuedCount }: { queuedCount: number }) {
  const t = useTranslations('requests');
  const tLang = useTranslations('languages');
  const tErrors = useTranslations('errors.codes');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [title, setTitle] = React.useState('');
  const [artist, setArtist] = React.useState('');
  const [targets, setTargets] = React.useState<string[]>([]);
  const [alias, setAlias] = React.useState('');
  const [note, setNote] = React.useState('');
  const [lyrics, setLyrics] = React.useState('');

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
    setStructure(null);
    setDone(null);
    checkedRef.current = '';
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
            ? t('submitHintWithLyrics')
            : t('submitHintWithoutLyrics', { count: queuedCount })}
        </p>
        <Button type="submit" variant="primary" loading={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
