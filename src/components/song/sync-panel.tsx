'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { SyncData } from '@/domain/song/share-package';
import type { TrackCandidate } from '@/domain/song/spotify-match';
import { loadSpotifyIframeApi } from '@/lib/spotify-embed';
import type { EmbedController, PlaybackUpdate } from '@/lib/spotify-embed';
import { parseSpotifyTrackId, saveSpotifyTrack, saveTimings } from '@/lib/sync-store';
import { formatDuration, lookupCopy } from '@/lib/spotify-search-copy';
import { Button } from '@/components/ui/button';
import { Field, FieldHint, FieldInput, FieldLabel } from '@/components/ui/field';
import { cn } from '@/lib/cn';

/**
 * Playing the song in time with the words.
 *
 * Two clocks, one of which is real. With a Spotify track lined up, the embed
 * reports its own position and the lines follow it — the sync then works on any
 * device the link reaches, because the timings are measured against the track,
 * not against somebody's stopwatch. Without a track, a plain clock starts when
 * the reader presses play on whatever they are listening on, which is the old
 * player's tap-sync and still the fallback everywhere.
 *
 * Timings are captured by tapping once per line as it is sung. They are saved
 * on the device and travel inside the share link, so the friend on the other
 * end gets a song that already moves.
 */

type Mode = 'idle' | 'tap' | 'play';

interface Clock {
  /** Track position (ms) at the last report, or wall-clock origin. */
  position: number;
  /** `performance.now()` when `position` was taken. */
  at: number;
  paused: boolean;
}

export interface SyncPanelProps {
  /** Storage key for this song on this device. */
  songKey: string;
  /** Sync data already known (device store, or the share link). */
  sync: SyncData;
  /** How many lines the reader sees, in reading order. */
  lineCount: number;
  /** The song's own title and artist — what the track lookup searches for. */
  title?: string;
  artist?: string;
  onActiveIndex: (index: number | null) => void;
  /** Called when the reader captures or changes sync data. */
  onSyncChange?: (sync: SyncData) => void;
}

type LookupState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'choose'; candidates: readonly TrackCandidate[] }
  | { status: 'empty' }
  | { status: 'off' }
  | { status: 'error' };

interface LookupResponse {
  ok?: unknown;
  code?: unknown;
  data?: {
    best?: TrackCandidate | null;
    confidence?: unknown;
    alternatives?: TrackCandidate[];
  };
}

const TICK_MS = 100;
const EMBED_HEIGHT = 152;

function activeIndexFor(timings: readonly number[], nowMs: number): number | null {
  let index: number | null = null;
  for (let i = 0; i < timings.length; i += 1) {
    const t = timings[i];
    if (t !== undefined && t <= nowMs) index = i;
    else break;
  }
  return index;
}

export function SyncPanel({
  songKey,
  sync,
  lineCount,
  title,
  artist,
  onActiveIndex,
  onSyncChange,
}: SyncPanelProps) {
  const t = useTranslations('sync');
  const copy = lookupCopy(useLocale());

  const [open, setOpen] = React.useState(Boolean(sync.spotifyTrackId || sync.timings));
  const [link, setLink] = React.useState('');
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [lookup, setLookup] = React.useState<LookupState>({ status: 'idle' });
  const [mode, setMode] = React.useState<Mode>('idle');
  const [captured, setCaptured] = React.useState<number[]>([]);
  const [embedState, setEmbedState] = React.useState<'none' | 'loading' | 'ready' | 'failed'>(
    'none',
  );

  const trackId = sync.spotifyTrackId;
  const timings = sync.timings;

  const embedHost = React.useRef<HTMLDivElement>(null);
  const controller = React.useRef<EmbedController | null>(null);
  const clock = React.useRef<Clock | null>(null);
  const embedHasPosition = React.useRef(false);
  // Mirrors of state for callbacks the embed holds on to, which would otherwise
  // close over the first render's values.
  const modeRef = React.useRef<Mode>('idle');
  const capturedRef = React.useRef<number[]>([]);
  React.useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  React.useEffect(() => {
    capturedRef.current = captured;
  }, [captured]);

  const commit = React.useCallback(
    (next: SyncData) => {
      saveSpotifyTrack(songKey, next.spotifyTrackId);
      saveTimings(songKey, next.timings);
      onSyncChange?.(next);
    },
    [songKey, onSyncChange],
  );

  /** Where the track is right now, interpolated between reports. */
  const nowMs = React.useCallback((): number | null => {
    const c = clock.current;
    if (!c) return null;
    if (c.paused) return c.position;
    return c.position + (performance.now() - c.at);
  }, []);

  // ── Spotify embed ──
  React.useEffect(() => {
    if (!open || !trackId) return;

    let cancelled = false;
    const loading = window.setTimeout(() => setEmbedState('loading'), 0);

    loadSpotifyIframeApi()
      .then((api) => {
        const host = embedHost.current;
        if (cancelled || !host) return;
        // The API replaces the element it is given, so it gets a child of ours.
        host.innerHTML = '';
        const slot = document.createElement('div');
        host.appendChild(slot);

        api.createController(
          slot,
          { uri: `spotify:track:${trackId}`, width: '100%', height: EMBED_HEIGHT },
          (embed) => {
            if (cancelled) {
              embed.destroy();
              return;
            }
            controller.current = embed;
            embed.addListener('ready', () => setEmbedState('ready'));
            embed.addListener('playback_update', ({ data }: { data: PlaybackUpdate }) => {
              embedHasPosition.current = true;
              clock.current = { position: data.position, at: performance.now(), paused: data.isPaused };
              // The embed is the clock in every mode once it reports. Playing
              // it implicitly starts the sync; pausing it holds the line.
              if (modeRef.current === 'idle' && !data.isPaused) setMode('play');
            });
            setEmbedState('ready');
          },
        );
      })
      .catch(() => {
        if (!cancelled) setEmbedState('failed');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(loading);
      controller.current?.destroy();
      controller.current = null;
      embedHasPosition.current = false;
    };
  }, [open, trackId]);

  const showEmbed = open && Boolean(trackId);

  // ── the tick: drives the highlighted line ──
  React.useEffect(() => {
    if (mode !== 'play' || !timings) {
      if (mode !== 'tap') onActiveIndex(null);
      return;
    }
    const id = window.setInterval(() => {
      const now = nowMs();
      onActiveIndex(now === null ? null : activeIndexFor(timings, now));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [mode, timings, nowMs, onActiveIndex]);

  // ── tap-sync ──
  const tap = React.useCallback(() => {
    if (modeRef.current !== 'tap') return;
    const now = nowMs();
    if (now === null) return;
    const next = [...capturedRef.current, Math.round(now)];
    setCaptured(next);
    onActiveIndex(next.length - 1);
    if (next.length >= lineCount) {
      commit({ spotifyTrackId: trackId, timings: next });
      setMode('play');
    }
  }, [nowMs, lineCount, commit, trackId, onActiveIndex]);

  function startTap() {
    setCaptured([]);
    onActiveIndex(null);
    // Without an embed reporting, the wall clock starts at the tap of "start":
    // the reader presses play elsewhere and this at the same moment.
    if (!embedHasPosition.current) clock.current = { position: 0, at: performance.now(), paused: false };
    setMode('tap');
  }

  function finishTapEarly() {
    if (captured.length > 0) commit({ spotifyTrackId: trackId, timings: captured });
    setMode(captured.length > 0 ? 'play' : 'idle');
  }

  function startPlay() {
    if (!embedHasPosition.current) clock.current = { position: 0, at: performance.now(), paused: false };
    setMode('play');
  }

  function stop() {
    setMode('idle');
    onActiveIndex(null);
    if (!embedHasPosition.current) clock.current = null;
  }

  function clearTimings() {
    commit({ spotifyTrackId: trackId, timings: null });
    setCaptured([]);
    stop();
  }

  // Space taps a line while capturing, unless the reader is typing somewhere.
  React.useEffect(() => {
    if (mode !== 'tap') return;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.code === 'Space') {
        event.preventDefault();
        tap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, tap]);

  function submitLink(event: React.FormEvent) {
    event.preventDefault();
    const id = parseSpotifyTrackId(link);
    if (!id) {
      setLinkError(t('linkInvalid'));
      return;
    }
    setLinkError(null);
    setLink('');
    setLookup({ status: 'idle' });
    commit({ spotifyTrackId: id, timings });
  }

  /**
   * Looks the track up by name instead of by pasted link.
   *
   * A confident match is attached straight away, because that is the four steps
   * this feature exists to remove. Anything less shows the shortlist: attaching
   * the wrong recording would make the sync drift against a track the reader
   * never chose, and they would read that as the product being broken rather
   * than as a guess.
   */
  const findTrack = React.useCallback(async () => {
    if (!title) return;
    setLookup({ status: 'searching' });

    try {
      const response = await fetch('/api/spotify/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, artist: artist ?? '' }),
      });

      const payload = (await response.json()) as LookupResponse;

      if (!response.ok || payload.ok !== true) {
        const code = payload.code;
        setLookup({
          status: code === 'not_configured' || code === 'auth_failed' ? 'off' : 'error',
        });
        return;
      }

      const best = payload.data?.best ?? null;
      if (!best) {
        setLookup({ status: 'empty' });
        return;
      }

      if (payload.data?.confidence === 'high') {
        setLookup({ status: 'idle' });
        commit({ spotifyTrackId: best.id, timings });
        return;
      }

      setLookup({
        status: 'choose',
        candidates: [best, ...(payload.data?.alternatives ?? [])],
      });
    } catch {
      setLookup({ status: 'error' });
    }
  }, [title, artist, commit, timings]);

  function chooseCandidate(candidate: TrackCandidate) {
    setLookup({ status: 'idle' });
    commit({ spotifyTrackId: candidate.id, timings });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-panel px-4 py-3">
        <p className="text-[13px] text-bone-muted">{t('teaser')}</p>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {t('open')}
        </Button>
      </div>
    );
  }

  const hasTimings = Boolean(timings && timings.length > 0);

  return (
    <section
      aria-label={t('title')}
      className="space-y-4 rounded-card border border-feel/30 bg-feel-soft/40 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-feel">
            {t('title')}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-bone-muted">
            {trackId ? t('withTrack') : t('withoutTrack')}
          </p>
        </div>
        <Button variant="quiet" size="sm" onClick={() => setOpen(false)}>
          {t('hide')}
        </Button>
      </div>

      {trackId ? (
        <div className="space-y-2">
          <div ref={embedHost} className="min-h-[152px] overflow-hidden rounded-xl bg-ground-raised" />
          {showEmbed && embedState === 'loading' ? (
            <p className="text-[12px] text-olive">{t('embedLoading')}</p>
          ) : null}
          {showEmbed && embedState === 'failed' ? (
            <p className="text-[12px] text-danger">{t('embedFailed')}</p>
          ) : null}
          <p className="text-[12px] text-olive">{t('previewNote')}</p>
          <Button
            variant="quiet"
            size="sm"
            onClick={() => commit({ spotifyTrackId: null, timings })}
          >
            {t('changeTrack')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {title ? (
            <div className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={findTrack}
                disabled={lookup.status === 'searching'}
              >
                {lookup.status === 'searching' ? copy.searching : copy.find}
              </Button>

              {lookup.status === 'choose' ? (
                <div className="space-y-2">
                  <p className="text-[12.5px] text-olive">{copy.pick}</p>
                  <ul className="space-y-1">
                    {lookup.candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          onClick={() => chooseCandidate(candidate)}
                          className="flex w-full items-center gap-3 rounded-xl border border-line bg-ground-raised px-3 py-2 text-left transition-colors hover:border-feel/50"
                        >
                          {candidate.artworkUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={candidate.artworkUrl}
                              alt=""
                              width={40}
                              height={40}
                              className="size-10 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <span className="size-10 shrink-0 rounded-md bg-line" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold text-bone">
                              {candidate.name}
                            </span>
                            <span className="block truncate text-[12px] text-bone-muted">
                              {candidate.artists.join(', ')}
                              {candidate.albumName ? ` · ${candidate.albumName}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 text-[12px] tabular-nums text-olive">
                            {formatDuration(candidate.durationMs)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {lookup.status === 'empty' ? (
                <p className="text-[12.5px] text-olive">{copy.none}</p>
              ) : null}
              {lookup.status === 'off' ? (
                <p className="text-[12.5px] text-olive">{copy.unavailable}</p>
              ) : null}
              {lookup.status === 'error' ? (
                <p className="text-[12.5px] text-danger">{copy.failed}</p>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={submitLink} className="space-y-2">
            <Field error={linkError}>
              <FieldLabel>{t('linkLabel')}</FieldLabel>
              <FieldHint>{t('linkHint')}</FieldHint>
              <div className="flex gap-2">
                <FieldInput
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  placeholder="https://open.spotify.com/track/…"
                  inputMode="url"
                  autoComplete="off"
                />
                <Button type="submit" variant="secondary" size="md" className="shrink-0 whitespace-nowrap">
                  {t('linkSubmit')}
                </Button>
              </div>
            </Field>
          </form>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {mode === 'tap' ? (
          <>
            <Button variant="primary" size="lg" onClick={tap} className="min-w-40">
              {t('tapLine', { n: Math.min(captured.length + 1, lineCount), total: lineCount })}
            </Button>
            <Button variant="ghost" size="sm" onClick={finishTapEarly}>
              {t('tapFinish')}
            </Button>
          </>
        ) : (
          <>
            {hasTimings && mode !== 'play' ? (
              <Button variant="primary" size="sm" onClick={startPlay}>
                {trackId ? t('playFollow') : t('playSynced')}
              </Button>
            ) : null}
            {mode === 'play' ? (
              <Button variant="secondary" size="sm" onClick={stop}>
                {t('stop')}
              </Button>
            ) : null}
            <Button variant={hasTimings ? 'ghost' : 'primary'} size="sm" onClick={startTap}>
              {hasTimings ? t('retap') : t('startTap')}
            </Button>
            {hasTimings ? (
              <Button variant="quiet" size="sm" onClick={clearTimings}>
                {t('clear')}
              </Button>
            ) : null}
          </>
        )}
      </div>

      <p className={cn('text-[12.5px] leading-relaxed', mode === 'tap' ? 'text-amber' : 'text-olive')}>
        {mode === 'tap'
          ? trackId
            ? t('tapHintTrack')
            : t('tapHintClock')
          : hasTimings
            ? trackId
              ? t('readyHintTrack')
              : t('readyHintClock')
            : t('idleHint')}
      </p>
    </section>
  );
}
