'use client';

import * as React from 'react';

/**
 * A reader's own renderings, kept on their device.
 *
 * When somebody suggests a better line, they see their version immediately —
 * before, and regardless of, any maintainer accepting it. That instant payoff is
 * the reason the flow gets used at all; waiting for review to see your own words
 * would make contributing feel like sending mail into a void.
 *
 * `localStorage` is modelled here as what it actually is: an external store,
 * read through `useSyncExternalStore`. That is not ceremony — it is the only way
 * to read a client-only value without either a hydration mismatch or a
 * set-state-in-effect cascade, and it means a second tab editing the same song
 * updates this one for free.
 *
 * Every access is guarded: `localStorage` throws outright in some privacy modes,
 * and the app must degrade to "no saved versions" rather than to a blank page.
 */

const STORAGE_PREFIX = 'feelyrics:fit:';

export type OwnRenderings = Record<string, string>;

const EMPTY: OwnRenderings = Object.freeze({});

/**
 * Snapshots must be referentially stable between reads, or `useSyncExternalStore`
 * re-renders forever. The cache holds the last parsed object per song and is only
 * replaced when the underlying string actually changes.
 */
const snapshotCache = new Map<string, { raw: string | null; parsed: OwnRenderings }>();

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function storageKey(songId: string): string {
  return `${STORAGE_PREFIX}${songId}`;
}

function parse(raw: string | null): OwnRenderings {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY;

    // Values come from storage, which an older build or another tab may have
    // written, so anything that is not a string is dropped rather than rendered.
    const clean: OwnRenderings = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') clean[key] = value;
    }
    return clean;
  } catch {
    return EMPTY;
  }
}

export function readOwnRenderings(songId: string): OwnRenderings {
  if (typeof window === 'undefined') return EMPTY;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(songId));
  } catch {
    return EMPTY;
  }

  const cached = snapshotCache.get(songId);
  if (cached && cached.raw === raw) return cached.parsed;

  const parsed = parse(raw);
  snapshotCache.set(songId, { raw, parsed });
  return parsed;
}

export function saveOwnRendering(
  songId: string,
  lineId: string,
  rendering: string,
): void {
  if (typeof window === 'undefined') return;

  const next = { ...readOwnRenderings(songId), [lineId]: rendering };

  try {
    window.localStorage.setItem(storageKey(songId), JSON.stringify(next));
  } catch {
    // Storage full or blocked. Cache the value anyway so it shows for this
    // session — losing the write is survivable, losing the feedback is not.
  }

  snapshotCache.set(songId, { raw: JSON.stringify(next), parsed: next });
  notify();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);

  // `storage` fires in *other* tabs, which is exactly the case local state
  // cannot cover.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) {
      snapshotCache.clear();
      callback();
    }
  };

  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The reader's saved versions for one song.
 *
 * On the server, and during the first client render, this is empty — which is
 * correct rather than a limitation: the markup the server produced knows nothing
 * about this device, and matching it is what keeps hydration clean.
 */
export function useOwnRenderings(songId: string | undefined): OwnRenderings {
  const getSnapshot = React.useCallback(
    () => (songId ? readOwnRenderings(songId) : EMPTY),
    [songId],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
