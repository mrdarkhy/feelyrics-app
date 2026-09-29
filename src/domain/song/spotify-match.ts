/**
 * Choosing which Spotify track is *this* song.
 *
 * Search gives ten candidates; attaching the wrong one is worse than attaching
 * none, because a wrong track makes the sync silently lie — the words follow a
 * different recording and the reader concludes the product is broken. So this
 * module is deliberately willing to answer "I am not sure": a low-confidence
 * result is handed to a person to pick from rather than saved.
 *
 * The same rule as the engine's: never invent the thing you are not sure of.
 *
 * Pure. No network, no Spotify types — the caller maps the API payload into
 * `TrackCandidate` first, which also keeps Spotify's response shape out of the
 * domain.
 */

export interface TrackCandidate {
  readonly id: string;
  readonly name: string;
  readonly artists: readonly string[];
  readonly albumName: string;
  readonly durationMs: number;
  /** Album cover, smallest usable size. Null when Spotify sent none. */
  readonly artworkUrl: string | null;
  readonly popularity: number;
}

export interface MatchQuery {
  readonly title: string;
  readonly artist: string;
}

export type MatchConfidence = 'high' | 'low';

export interface MatchResult {
  /** The best candidate, or null when nothing scored well enough to show. */
  readonly best: TrackCandidate | null;
  /**
   * `high` means it can be attached without asking. `low` means a person
   * chooses — the caller must not save a `low` match on its own.
   */
  readonly confidence: MatchConfidence;
  /** Other plausible candidates, best first, without `best`. */
  readonly alternatives: readonly TrackCandidate[];
}

/**
 * Words that mark a candidate as a *different* recording of the song. When the
 * query does not ask for one of these and the candidate name carries it, the
 * candidate is penalised: "Ohne Dich - Live" is the same composition but not the
 * track somebody is listening to.
 */
const VARIANT_MARKERS = [
  'live',
  'remix',
  'karaoke',
  'instrumental',
  'acoustic',
  'cover',
  'tribute',
  'sped up',
  'slowed',
  'nightcore',
  '8d',
  'reverb',
  'demo',
  'rehearsal',
  'edit',
  'mix',
];

/**
 * Artist names that are never the artist being looked for. A karaoke or
 * "tribute" release copies the title and the artist name into its own metadata,
 * so it scores well on every signal the matcher has — it has to be excluded by
 * name, not by score.
 */
const IMPOSTOR_ARTIST_PATTERNS = [
  /karaoke/i,
  /tribute/i,
  /made famous by/i,
  /in the style of/i,
  /\bcover band\b/i,
  /backing track/i,
];

/** Bracketed suffixes: "(Remastered 2011)", "- Radio Edit", "[Official Video]". */
const SUFFIX = /\s*(?:[([][^)\]]*[)\]]|-\s+[^-]*)$/;

/**
 * Letters that carry no combining mark to strip, so Unicode decomposition walks
 * straight past them.
 *
 * Turkish dotless "ı" is the one that matters here: it is its own letter, not
 * "i" plus a mark, so "Şımarık" folds to "sımarık" and never meets the "simarik"
 * somebody typed — while "ş", "ğ", "ö", "ü", "ç" all fold correctly on their
 * own. The rest of the table is the same problem in the other languages the
 * catalogue touches.
 */
const ATOMIC_FOLDS: readonly (readonly [RegExp, string])[] = [
  [/ı/g, 'i'],
  [/ø/g, 'o'],
  [/đ|ð/g, 'd'],
  [/ł/g, 'l'],
  [/þ/g, 'th'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/ß/g, 'ss'],
];

/**
 * Normalises a title or artist for comparison.
 *
 * Diacritics are folded because the two sides disagree about them constantly:
 * people type "simarik", Spotify has "Şımarık". Folding is safe here precisely
 * because this is a comparison key and never displayed.
 */
export function normalizeForMatch(value: string): string {
  const folded = ATOMIC_FOLDS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value.toLowerCase(),
  );

  return folded
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`´]/g, "'")
    .replace(/\bfeat\.?\b|\bft\.?\b|\bwith\b/g, ' ')
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** The title without a trailing parenthetical or dash-suffix. */
export function baseTitle(value: string): string {
  const stripped = value.replace(SUFFIX, '').trim();
  // A title that is *only* a suffix ("(Intro)") keeps its original form.
  return stripped.length > 0 ? stripped : value;
}

function tokens(value: string): Set<string> {
  return new Set(normalizeForMatch(value).split(' ').filter(Boolean));
}

function shared(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

/**
 * How much of the *smaller* side is present in the larger — the right question
 * for artists, where Spotify credits three people and the person typed one.
 */
function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  return shared(a, b) / Math.min(a.size, b.size);
}

/**
 * How much of the *larger* side is accounted for — the right question for
 * titles, where `min` would rate "Nothing" a perfect match for "Nothing Else
 * Matters" because the one word it has is one of the three.
 */
function coverageRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  return shared(a, b) / Math.max(a.size, b.size);
}

/**
 * One title is a prefix of the other *and* they are nearly the same length.
 *
 * The length guard is the point. Without it "Nothing" is a prefix of "Nothing
 * Else Matters" and scores as the same song — a different track that happens to
 * start with the same word. A prefix earns its bonus only when what is left over
 * is a fragment, which is what survives `baseTitle` for real near-misses like a
 * trailing "Pt. 1".
 */
function isNearPrefix(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length === 0 || !longer.startsWith(shorter)) return false;
  return shorter.length / longer.length >= 0.7;
}

function hasVariantMarker(value: string): boolean {
  const normalized = normalizeForMatch(value);
  return VARIANT_MARKERS.some((marker) =>
    new RegExp(`(^| )${marker.replace(' ', ' ')}( |$)`).test(normalized),
  );
}

function isImpostor(candidate: TrackCandidate): boolean {
  return candidate.artists.some((artist) =>
    IMPOSTOR_ARTIST_PATTERNS.some((pattern) => pattern.test(artist)),
  );
}

/**
 * Score for one candidate. Higher is better; negative means "do not show".
 *
 * The weights say what matters: the artist is a stronger signal than the title,
 * because titles repeat across the catalogue far more often than an artist gets
 * a song wrong.
 */
export function scoreCandidate(query: MatchQuery, candidate: TrackCandidate): number {
  if (isImpostor(candidate)) return -1;

  const wantedTitle = normalizeForMatch(baseTitle(query.title));
  const candidateTitle = normalizeForMatch(baseTitle(candidate.name));
  if (wantedTitle.length === 0) return -1;

  let score = 0;

  if (candidateTitle === wantedTitle) score += 100;
  else if (isNearPrefix(wantedTitle, candidateTitle)) score += 65;
  else {
    const ratio = coverageRatio(tokens(wantedTitle), tokens(candidateTitle));
    if (ratio >= 0.75) score += 45;
    else if (ratio >= 0.5) score += 20;
    else return -1; // Not the same song by any reading.
  }

  const wantedArtists = tokens(query.artist);
  const candidateArtists = tokens(candidate.artists.join(' '));
  const artistRatio = overlapRatio(wantedArtists, candidateArtists);

  if (wantedArtists.size === 0) {
    // No artist given: the title has to carry it alone, and never confidently.
    score += 10;
  } else if (artistRatio === 1) score += 60;
  else if (artistRatio >= 0.5) score += 35;
  else if (artistRatio > 0) score += 10;
  else score -= 30;

  // A variant the caller did not ask for.
  if (hasVariantMarker(candidate.name) && !hasVariantMarker(query.title)) score -= 40;

  // Popularity breaks ties between otherwise identical rows (the album version
  // and the same track on a compilation). Small on purpose: it must never
  // outrank a name.
  score += Math.round(candidate.popularity / 20);

  return score;
}

const CONFIDENT_SCORE = 150;
const SHOWABLE_SCORE = 70;

/**
 * Ranks the candidates and says whether the top one can be trusted.
 *
 * Two guards beyond the score. A confident answer needs the runner-up to be
 * clearly behind — two tracks scoring the same means the question "which
 * recording" has not actually been answered. And a query with no artist is
 * never confident, however well the title matches.
 */
export function matchTrack(
  query: MatchQuery,
  candidates: readonly TrackCandidate[],
): MatchResult {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(query, candidate) }))
    .filter((row) => row.score >= SHOWABLE_SCORE)
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top) return { best: null, confidence: 'low', alternatives: [] };

  const runnerUp = ranked[1];
  const clearWinner = !runnerUp || top.score - runnerUp.score >= 25;
  const hasArtist = tokens(query.artist).size > 0;

  return {
    best: top.candidate,
    confidence:
      top.score >= CONFIDENT_SCORE && clearWinner && hasArtist ? 'high' : 'low',
    alternatives: ranked.slice(1, 5).map((row) => row.candidate),
  };
}

/**
 * The search string sent to Spotify.
 *
 * Field filters (`track:`, `artist:`) are used because an unfiltered query
 * matches album and playlist names too and buries the track. The caller falls
 * back to a plain query when the filtered one finds nothing, which happens when
 * Spotify's metadata spells the artist differently than the person did.
 */
export function buildSearchQuery(query: MatchQuery): string {
  const title = baseTitle(query.title).replace(/["]/g, ' ').trim();
  const artist = query.artist.replace(/["]/g, ' ').trim();
  if (!artist) return `track:"${title}"`;
  return `track:"${title}" artist:"${artist}"`;
}

/** The unfiltered fallback: just the words, which Spotify is good at. */
export function buildFallbackQuery(query: MatchQuery): string {
  return `${baseTitle(query.title)} ${query.artist}`.trim().replace(/\s+/g, ' ');
}
