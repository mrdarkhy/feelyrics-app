/**
 * Where a request came from.
 *
 * The growth plan's leading indicator is the weekly request count, and a single
 * number cannot answer the only question worth asking about it: which of the
 * things we did brought people here. So a request carries the channel it
 * arrived through, captured from a `?src=` marker on the link that was posted.
 *
 * Why a closed list rather than a free text column: `src` arrives from the open
 * internet, is written by anyone who can edit a URL, and is then rendered in the
 * maintainer area. A fixed set means the stored value is always one of ours —
 * an unknown marker becomes `other` instead of becoming a row of somebody
 * else's text — and it keeps the weekly breakdown legible instead of scattering
 * counts across `tiktok`, `TikTok` and `tik-tok`.
 *
 * `direct` is the honest default: no marker on the link, so we do not know, and
 * we say so rather than inventing an attribution.
 */

export const REQUEST_CHANNELS = [
  /** No marker on the link — typed, bookmarked, or a share that lost the query. */
  'direct',
  'tt',
  'ig',
  'yt',
  'x',
  'rd',
  'hn',
  /** A marker we do not recognise. Counted, never trusted as a label. */
  'other',
] as const;

export type RequestChannel = (typeof REQUEST_CHANNELS)[number];

export const DEFAULT_REQUEST_CHANNEL: RequestChannel = 'direct';

/** The query parameter the posted links carry. */
export const CHANNEL_PARAM = 'src';

/** A marker longer than this is not a typo, it is somebody probing. */
const MAX_RAW_CHANNEL_LENGTH = 24;

export function isRequestChannel(value: unknown): value is RequestChannel {
  return (
    typeof value === 'string' &&
    (REQUEST_CHANNELS as readonly string[]).includes(value)
  );
}

/**
 * Turns whatever was in the URL into one of ours.
 *
 * Absent, empty or over-long → `direct`; a known marker → itself; anything else
 * → `other`. Note the asymmetry: an unrecognised marker is not silently dropped
 * to `direct`, because "somebody arrived from a link we did not plan" is a
 * different fact from "somebody arrived with no link at all", and only one of
 * them means a campaign marker is mistyped somewhere.
 */
export function normalizeChannel(raw: unknown): RequestChannel {
  if (typeof raw !== 'string') return DEFAULT_REQUEST_CHANNEL;

  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > MAX_RAW_CHANNEL_LENGTH) {
    return DEFAULT_REQUEST_CHANNEL;
  }

  return isRequestChannel(value) ? value : 'other';
}
