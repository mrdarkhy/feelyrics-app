'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { TARGET_LANGUAGES } from '@/domain/shared/language';
import { submitRequestAction } from '@/actions/requests';
import { Button } from '@/components/ui/button';
import { ChipGroup } from '@/components/ui/chip';
import {
  Field,
  FieldHint,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

/**
 * The request form.
 *
 * The lyrics box is optional and says exactly what happens to what you paste:
 * it shapes the song and is not kept. Being specific about that is what makes
 * people willing to use the field — and the field is what moves a request from
 * "waiting on words" to "in the queue", which is the actual bottleneck.
 */
export function RequestForm() {
  const t = useTranslations('requests');
  const tLang = useTranslations('languages');
  const tErrors = useTranslations('errors.codes');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { notify } = useToast();

  const [title, setTitle] = React.useState('');
  const [artist, setArtist] = React.useState('');
  const [targets, setTargets] = React.useState<string[]>([]);
  const [alias, setAlias] = React.useState('');
  const [wantsLyrics, setWantsLyrics] = React.useState(false);
  const [lyrics, setLyrics] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

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
        lyrics: wantsLyrics ? lyrics : null,
      });

      if (!result.ok) {
        setFieldErrors({ [result.field ?? 'title']: tErrors(result.code) });
        return;
      }

      notify(result.data.duplicate ? t('successDuplicate') : t('success'), 'success');

      setTitle('');
      setArtist('');
      setTargets([]);
      setLyrics('');
      setWantsLyrics(false);

      // The queue below is server-rendered, so it needs a refresh to show the
      // row that was just added.
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="fl-surface flex flex-col gap-5 p-5">
      <h2 className="font-display text-lg font-extrabold text-bone">
        {t('formTitle')}
      </h2>

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
        <FieldLabel optional={tCommon('optional')}>{t('aliasLabel')}</FieldLabel>
        <FieldInput
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
          placeholder={t('aliasPlaceholder')}
          maxLength={60}
          autoComplete="nickname"
        />
      </Field>

      <div className="rounded-xl border border-line bg-ground-raised p-4">
        <div className="flex items-start gap-3">
          <input
            id="has-lyrics"
            type="checkbox"
            checked={wantsLyrics}
            onChange={(event) => setWantsLyrics(event.target.checked)}
            className={cn(
              'mt-1 size-4 shrink-0 rounded border-line bg-ground accent-amber',
            )}
            aria-describedby="has-lyrics-hint"
          />
          <div className="space-y-1">
            <label htmlFor="has-lyrics" className="text-[14px] font-semibold text-bone">
              {t('hasLyricsLabel')}
            </label>
            <p id="has-lyrics-hint" className="text-[13px] leading-relaxed text-bone-muted">
              {t('hasLyricsHint')}
            </p>
          </div>
        </div>

        {wantsLyrics ? (
          <div className="mt-4">
            <Field error={fieldErrors.lyrics}>
              <FieldLabel>{t('lyricsLabel')}</FieldLabel>
              <FieldHint>{t('lyricsPrivacy')}</FieldHint>
              <FieldTextarea
                value={lyrics}
                onChange={(event) => setLyrics(event.target.value)}
                placeholder={t('lyricsPlaceholder')}
                maxLength={24000}
                rows={8}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
