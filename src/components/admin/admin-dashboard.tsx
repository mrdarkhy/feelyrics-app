'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { useRouter } from '@/i18n/navigation';
import type { RequestView } from '@/lib/view-models';
import type { SuggestionStatus } from '@/domain/suggestion/suggestion';
import type { RequestStatus } from '@/domain/request/song-request';
import { reviewSuggestionAction } from '@/actions/suggestions';
import { updateRequestStatusAction } from '@/actions/requests';
import { signOutAction } from '@/actions/admin';
import { createSongsFromRequestAction } from '@/actions/song-body';
import { LANGUAGE_CODES } from '@/domain/shared/language';
import { LyricsEditor } from './lyrics-editor';
import type { EditorSongOption } from './lyrics-editor';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field, FieldInput, FieldLabel, FieldHint } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

export interface SuggestionView {
  id: string;
  songId: string;
  lineId: string;
  originalLine: string;
  engineDraft: string;
  proposedRendering: string;
  tags: readonly string[];
  comment: string | null;
  contributorAlias: string | null;
  status: SuggestionStatus;
  createdAt: string;
}

const TAB_CLASSES = cn(
  'rounded-pill px-4 py-2 text-[14px] font-semibold text-bone-muted transition-colors',
  'hover:text-bone data-[state=active]:bg-amber-soft data-[state=active]:text-amber',
);

/**
 * The maintainer's desk.
 *
 * Two queues that need a human: suggestions to rule on and requests to move
 * along. Accepting a suggestion rewrites the line for every reader, so the
 * action says so rather than presenting itself as a filing decision.
 */
export function AdminDashboard({
  suggestions,
  requests,
  songs,
}: {
  suggestions: readonly SuggestionView[];
  requests: readonly RequestView[];
  songs: readonly EditorSongOption[];
}) {
  const t = useTranslations('admin');
  const router = useRouter();
  const { notify } = useToast();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-extrabold text-bone">{t('title')}</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await signOutAction();
            router.refresh();
          }}
        >
          {t('signOut')}
        </Button>
      </div>

      <TabsPrimitive.Root defaultValue="suggestions" className="space-y-5">
        <TabsPrimitive.List
          aria-label={t('title')}
          className="flex gap-2 border-b border-line pb-3"
        >
          <TabsPrimitive.Trigger value="suggestions" className={TAB_CLASSES}>
            {t('suggestionsTab')} ({suggestions.length})
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="requests" className={TAB_CLASSES}>
            {t('requestsTab')} ({requests.length})
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="lyrics" className={TAB_CLASSES}>
            {t('lyricsTab')}
          </TabsPrimitive.Trigger>
        </TabsPrimitive.List>

        <TabsPrimitive.Content value="lyrics" className="focus:outline-none">
          <LyricsEditor songs={songs} />
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="suggestions" className="space-y-3 focus:outline-none">
          {suggestions.length === 0 ? (
            <p className="text-[15px] text-bone-muted">{t('noSuggestions')}</p>
          ) : (
            suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onDone={(message) => {
                  notify(message, 'success');
                  router.refresh();
                }}
              />
            ))
          )}
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="requests" className="space-y-3 focus:outline-none">
          {requests.length === 0 ? (
            <p className="text-[15px] text-bone-muted">{t('noRequests')}</p>
          ) : (
            requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                songs={songs}
                onDone={(message) => {
                  notify(message, 'success');
                  router.refresh();
                }}
              />
            ))
          )}
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onDone,
}: {
  suggestion: SuggestionView;
  onDone: (message: string) => void;
}) {
  const t = useTranslations('admin');
  const tTags = useTranslations('tags');
  const tErrors = useTranslations('errors.codes');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function review(status: SuggestionStatus) {
    setError(null);
    startTransition(async () => {
      const result = await reviewSuggestionAction(suggestion.id, status, note || null);
      if (!result.ok) {
        setError(tErrors(result.code));
        return;
      }
      onDone(t(status === 'accepted' ? 'accept' : 'reject'));
    });
  }

  return (
    <article className="fl-surface space-y-4 p-4">
      <div className="space-y-2 text-[14px]">
        <p className="text-olive">{suggestion.originalLine}</p>
        <p className="text-bone-muted line-through decoration-danger/50">
          {suggestion.engineDraft}
        </p>
        <p className="font-display text-[17px] font-bold text-feel">
          {suggestion.proposedRendering}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {suggestion.tags.map((tag) => (
          <Chip key={tag} tone="neutral">
            {tTags(tag)}
          </Chip>
        ))}
        <span className="text-[12px] text-olive">
          {t('proposedBy', { name: suggestion.contributorAlias ?? t('anonymous') })}
        </span>
      </div>

      {suggestion.comment ? (
        <p className="border-l-2 border-line pl-3 text-[13px] italic text-bone-muted">
          {suggestion.comment}
        </p>
      ) : null}

      <Field error={error}>
        <FieldLabel>{t('reviewNoteLabel')}</FieldLabel>
        <FieldHint>{t('reviewNoteHint')}</FieldHint>
        <FieldInput
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
        />
      </Field>

      <p className="text-[12px] text-olive">{t('acceptWarning')}</p>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" loading={pending} onClick={() => review('accepted')}>
          {t('accept')}
        </Button>
        <Button variant="ghost" size="sm" loading={pending} onClick={() => review('disputed')}>
          {t('dispute')}
        </Button>
        <Button variant="danger" size="sm" loading={pending} onClick={() => review('rejected')}>
          {t('reject')}
        </Button>
      </div>
    </article>
  );
}

function RequestCard({
  request,
  songs,
  onDone,
}: {
  request: RequestView;
  songs: readonly EditorSongOption[];
  onDone: (message: string) => void;
}) {
  const t = useTranslations('admin');
  const tRequests = useTranslations('requests');
  const tErrors = useTranslations('errors.codes');
  const tLang = useTranslations('languages');
  const [slug, setSlug] = React.useState(request.songSlug ?? '');
  const [source, setSource] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Only a request that brought words can become a song: the rest of the site
  // depends on never translating a lyric nobody handed us.
  const canOpen = request.status === 'queued' && !request.songSlug;

  /**
   * The song this request points at, if the slug names one at all.
   *
   * "Mark ready" is the step that throws the pasted lyrics away, so it stays
   * shut until the song it closes actually has a translated body. The server
   * refuses the same move anyway; this is so the refusal is visible before the
   * click rather than as an error afterwards.
   */
  const target = React.useMemo(
    () => songs.find((song) => song.slug === slug.trim()) ?? null,
    [songs, slug],
  );
  const readyBlocked = !target || target.lineCount === 0;

  function openSongs() {
    setError(null);
    startTransition(async () => {
      const result = await createSongsFromRequestAction(request.id, source);
      if (!result.ok) {
        setError(tErrors(result.code));
        return;
      }
      const first = result.data.created[0] ?? result.data.existing[0];
      if (first) setSlug(first);
      onDone(
        t('requestOpened', {
          count: result.data.created.length + result.data.existing.length,
        }),
      );
    });
  }

  function move(status: RequestStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateRequestStatusAction(
        request.id,
        status,
        status === 'ready' ? slug : undefined,
      );
      if (!result.ok) {
        setError(tErrors(result.code));
        return;
      }
      onDone(tRequests(`status.${status}`));
    });
  }

  return (
    <article className="fl-surface space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[15px] font-bold text-bone">{request.title}</p>
          <p className="text-[13px] text-bone-muted">{request.artist}</p>
        </div>
        <Chip tone="neutral">{tRequests(`status.${request.status}`)}</Chip>
      </div>

      {request.requesterNote ? (
        <p
          lang={request.requesterNoteLanguage ?? undefined}
          className="text-[13px] italic leading-relaxed text-patina"
        >
          “{request.requesterNote}”
        </p>
      ) : null}

      {canOpen ? (
        <div className="space-y-2 rounded-xl border border-line bg-ground-raised p-3">
          <p className="text-[13px] leading-relaxed text-bone-muted">
            {t('requestOpenHint', {
              targets: request.targets.map((code) => tLang(code)).join(' + '),
            })}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`source-${request.id}`}
                className="text-[11px] font-semibold uppercase tracking-widest text-olive"
              >
                {t('requestSourceLabel')}
              </label>
              <select
                id={`source-${request.id}`}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[13px] text-bone focus:border-amber/60 focus:outline-none"
              >
                <option value="">{t('requestSourcePlaceholder')}</option>
                {LANGUAGE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {tLang(code)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={pending}
              disabled={source.length === 0}
              onClick={openSongs}
            >
              {t('requestOpenAction')}
            </Button>
          </div>
        </div>
      ) : null}

      <Field error={error}>
        <FieldLabel>{t('songSlugLabel')}</FieldLabel>
        <FieldInput
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          placeholder="artist-title-es-tr"
        />
        {slug.trim().length > 0 && readyBlocked ? (
          <FieldHint>{t('markReadyBlocked')}</FieldHint>
        ) : null}
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" loading={pending} onClick={() => move('queued')}>
          {t('markQueued')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={pending}
          disabled={slug.trim().length === 0 || readyBlocked}
          onClick={() => move('ready')}
        >
          {t('markReady')}
        </Button>
        <Button variant="danger" size="sm" loading={pending} onClick={() => move('declined')}>
          {t('markDeclined')}
        </Button>
      </div>
    </article>
  );
}
