import { isUiLocale } from '@/domain/shared/language';
import type { UiLocale } from '@/domain/shared/language';

/**
 * Copy for the track lookup controls.
 *
 * It lives in code rather than in `messages/*.json` for the same reason the song
 * and pair page phrasing does: the message catalogues are being edited by
 * another change that has not landed yet, and a string added in both places is a
 * merge conflict in a file where a conflict silently costs a translation. When
 * the queue is clear these move into the catalogues, which is where UI copy
 * belongs.
 */

interface LookupCopy {
  readonly find: string;
  readonly searching: string;
  readonly matched: string;
  readonly pick: string;
  readonly none: string;
  readonly unavailable: string;
  readonly failed: string;
  readonly use: string;
}

const COPY: Record<UiLocale, LookupCopy> = {
  en: {
    find: 'Find it on Spotify',
    searching: 'Looking for the track…',
    matched: 'Found it. Wrong one? Change track.',
    pick: 'More than one could be it — pick the recording you are listening to.',
    none: 'No track matched. Paste the Spotify link instead.',
    unavailable: 'Track search is off on this site. Paste the Spotify link instead.',
    failed: 'Spotify did not answer. Paste the link instead, or try again shortly.',
    use: 'Use this one',
  },
  tr: {
    find: "Spotify'da bul",
    searching: 'Parça aranıyor…',
    matched: 'Bulundu. Yanlışsa parçayı değiştir.',
    pick: 'Birden fazlası olabilir — dinlediğin kaydı seç.',
    none: 'Eşleşen parça yok. Spotify linkini yapıştır.',
    unavailable: 'Parça arama bu sitede kapalı. Spotify linkini yapıştır.',
    failed: 'Spotify cevap vermedi. Linki yapıştır ya da biraz sonra dene.',
    use: 'Bunu kullan',
  },
  es: {
    find: 'Buscarla en Spotify',
    searching: 'Buscando la canción…',
    matched: 'Encontrada. ¿No es esa? Cambia de pista.',
    pick: 'Puede ser más de una: elige la grabación que estás escuchando.',
    none: 'Ninguna coincide. Pega el enlace de Spotify.',
    unavailable: 'La búsqueda está desactivada aquí. Pega el enlace de Spotify.',
    failed: 'Spotify no respondió. Pega el enlace o inténtalo en un momento.',
    use: 'Usar esta',
  },
};

export function lookupCopy(locale: string): LookupCopy {
  return COPY[isUiLocale(locale) ? locale : 'en'];
}

/** "3:47" — the duration, for telling two recordings apart at a glance. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
