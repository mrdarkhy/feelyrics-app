'use client';

import * as React from 'react';
import type { SyncData } from '@/domain/song/share-package';

/**
 * Per-song sync data on this device: which Spotify track the reader lined the
 * song up with, and the tap-sync timings they captured.
 *
 * Kept in `localStorage` for the same reason the reader's own renderings are —
 * it is the reader's work, it should survive a reload, and it should not need
 * an account. When the song is shared, the data rides inside the link, so the
 * person on the other end gets the sync without doing the taps themselves.
 *
 * Same external-store pattern as `own-renderings`: stable snapshots, guarded
 * storage access, a broadcast so two tabs agree.
 */

const STORAGE_PREFIX = 'feelyrics:sync:';

const EMPTY: SyncData = Object.freeze({ spotifyTrackId: null, timings: null });

const cache = new Map<string, { raw: string | null; parsed: SyncData }>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function storageKey(songKey: string): string {
  return `${STORAGE_PREFIX}${songKey}`;
}

function parse(raw: string | null): SyncData {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return EMPTY;
    const record = value as Record<string, unknown>;
    const spotifyTrackId =
      typeof record.spotifyTrackId === 'string' && /^[A-Za-z0-9]{22}$/.test(record.spotifyTrackId)
        ? record.spotifyTrackId
        : null;
    const timings =
      Array.isArray(record.timings) && record.timings.every((n) => typeof n === 'number')
        ? (record.timings as number[])
        : null;
    if (!spotifyTrackId && !timings) return EMPTY;
    return { spotifyTrackId, timings };
  } catch {
    return EMPTY;
  }
}

function read(songKey: string): SyncData {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(songKey));
  } catch {
    raw = null;
  }
  const cached = cache.get(songKey);
  if (cached && cached.raw === raw) return cached.parsed;
  const parsed = parse(raw);
  cache.set(songKey, { raw, parsed });
  return parsed;
}

function write(songKey: string, data: SyncData): void {
  try {
    if (!data.spotifyTrackId && !data.timings) {
      window.localStorage.removeItem(storageKey(songKey));
    } else {
      window.localStorage.setItem(storageKey(songKey), JSON.stringify(data));
    }
  } catch {
    // Private mode or a full quota: the panel still works for this session.
  }
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSyncData(songKey: string | null): SyncData {
  const getSnapshot = React.useCallback(
    () => (songKey ? read(songKey) : EMPTY),
    [songKey],
  );
  return React.useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function saveSpotifyTrack(songKey: string, spotifyTrackId: string | null): void {
  write(songKey, { ...read(songKey), spotifyTrackId });
}

export function saveTimings(songKey: string, timings: readonly number[] | null): void {
  write(songKey, { ...read(songKey), timings: timings ? [...timings] : null });
}

/**
 * Pulls a track id out of whatever somebody pasted: a share URL with tracking
 * parameters, a localised URL (`/intl-tr/track/…`), a `spotify:track:` URI or
 * the bare id.
 */
export function parseSpotifyTrackId(input: string): string | null {
  const text = input.trim();
  const match = /track[/:]([A-Za-z0-9]{22})/.exec(text);
  if (match?.[1]) return match[1];
  return /^[A-Za-z0-9]{22}$/.test(text) ? text : null;
}
