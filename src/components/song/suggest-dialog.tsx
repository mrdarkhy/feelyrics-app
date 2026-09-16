'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { PUBLIC_REASON_TAGS } from '@/domain/song/reason-tag';
import { toBcp47 } from '@/domain/shared/language';
import type { LanguageCode, TargetLanguage } from '@/domain/shared/language';
import type { LineView } from '@/lib/view-models';
import { submitSuggestionAction } from '@/actions/suggestions';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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

/**
 * "How would you land this line?"
 *
 * The form is deliberately short — a rendering, at least one reason, and two
 * optional fields — because the cost of the first contribution is what decides
 * whether there is ever a second one. No account, no email, no verification.
 *
 * The reason tag is the one thing that cannot be skipped: an untagged correction
 * is an opinion, a tagged one is a labelled preference pair.
 */
interface SuggestDialogProps {
  songId: string;
  line: LineView | null;
  source: LanguageCode;
  target: TargetLanguage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted: (lineId: string, rendering: string) => void;
}

export function SuggestDialog({ line, ...props }: SuggestDialogProps) {
  if (!line) return null;

  // Keyed by line, so opening a different line mounts a fresh form rather than
  // syncing the old one's state in an effect. Resetting by remount is React's
  // own answer to "this state belongs to that prop".
  return <SuggestForm key={line.id} line={line} {...props} />;
}

function SuggestForm({
  songId,
  line,
  source,
  target,
  open,
  onOpenChange,
  onAccepted,
}: SuggestDialogProps & { line: LineView }) {
  const t = useTranslations('suggest');
  const tTags = useTranslations('tags');
  const tErrors = useTranslations('errors.codes');
  const tCommon = useTranslations('common');
  const { notify } = useToast();

  // Seeded from the line's current rendering: editing beats composing from
  // nothing, and it is the single biggest reason this flow gets completed.
  const [rendering, setRendering] = React.useState(line.rendering);
  const [tags, setTags] = React.useState<string[]>([]);
  const [alias, setAlias] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [tagError, setTagError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setTagError(null);

    if (tags.length === 0) {
      setTagError(tErrors('missing_reason_tag'));
      return;
    }

    startTransition(async () => {
      const result = await submitSuggestionAction({
        songId,
        lineId: line.id,
        originalLine: line.original,
        engineDraft: line.rendering,
        proposedRendering: rendering,
        tags,
        comment: comment || null,
        contributorAlias: alias || null,
      });

      if (!result.ok) {
        setError(tErrors(result.code));
        return;
      }

      onAccepted(line.id, rendering.trim());
      notify(t('success'), 'success');
      onOpenChange(false);
      setComment('');
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('title')} description={t('intro')}>
        <div className="rounded-xl border border-line bg-ground-raised p-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-olive">
            {t('originalLabel')}
          </p>
          <p lang={toBcp47(source)} className="mt-1 text-[15px] text-bone">
            {line.original}
          </p>
          <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-widest text-olive">
            {t('currentLabel')}
          </p>
          <p lang={toBcp47(target)} className="mt-1 text-[15px] text-patina">
            {line.rendering}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field error={error}>
            <FieldLabel>{t('yourVersionLabel')}</FieldLabel>
            <FieldTextarea
              value={rendering}
              onChange={(event) => setRendering(event.target.value)}
              lang={toBcp47(target)}
              required
              maxLength={400}
              className="min-h-20"
            />
          </Field>

          <Field error={tagError}>
            <FieldLabel>{t('tagsLabel')}</FieldLabel>
            <FieldHint>{t('tagsHint')}</FieldHint>
            <ChipGroup
              label={t('tagsLabel')}
              value={tags}
              onValueChange={setTags}
              options={PUBLIC_REASON_TAGS.map((tag) => ({
                value: tag,
                label: tTags(tag),
                description: tTags(`descriptions.${tag}`),
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

          <Field>
            <FieldLabel optional={tCommon('optional')}>{t('commentLabel')}</FieldLabel>
            <FieldInput
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t('commentPlaceholder')}
              maxLength={280}
            />
          </Field>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {pending ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
