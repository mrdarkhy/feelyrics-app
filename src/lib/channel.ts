'use client';

import {
  CHANNEL_PARAM,
  normalizeChannel,
} from '@/domain/request/request-channel';
import type { RequestChannel } from '@/domain/request/request-channel';

/**
 * Remembering which link brought somebody, for the length of one visit.
 *
 * The marker is on the link that was posted — usually a song page, not the
 * request form — so it has to survive the walk from that page to the form. It
 * is kept in `sessionStorage` rather than a cookie: it is not needed on the
 * server until the form is submitted, a cookie would be sent on every request
 * for no reason, and session scope is the honest lifetime — a visit, not a
 * person followed across weeks. Nothing here identifies anybody; the stored
 * value is one of eight words.
 */

const STORAGE_KEY = 'feelyrics.channel';

/** First marker wins: the link that opened the visit is the one that earned it. */
export function captureChannel(search: string): void {
  try {
    const raw = new URLSearchParams(search).get(CHANNEL_PARAM);
    if (raw === null) return;
    if (window.sessionStorage.getItem(STORAGE_KEY) !== null) return;
    window.sessionStorage.setItem(STORAGE_KEY, normalizeChannel(raw));
  } catch {
    // Private mode, blocked storage, a browser that says no: attribution is a
    // nicety and the request must go through without it.
  }
}

export function readChannel(): RequestChannel | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored === null ? null : normalizeChannel(stored);
  } catch {
    return null;
  }
}
