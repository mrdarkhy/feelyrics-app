'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getContainer } from '@/infrastructure/container';
import { translateNow } from '@/application/use-cases/translate-now';
import { isLanguageCode, isTargetLanguage, UI_LOCALES } from '@/domain/shared/language';
import { toSharePackage } from '@/domain/song/share-package';
import { encodeSharePackage, buildShareUrl } from '@/lib/share-link';
import { siteUrl } from '@/lib/env';
import { submitterKey } from '@/lib/submitter-key';
import type { ActionResult } from './suggestions';

export interface TranslateNowInput {
  title: string;
  artist: string;
  /** The song's own language. */
  source: string;
  /** One target per call, so each stays inside the function time limit. */
  target: string;
  lyrics: string;
  requesterAlias?: string | null;
  requesterNote?: string | null;
  requestId?: string | null;
  /** Set on the last target: closes the queue row and drops the pasted words. */
  closeRequest?: boolean;
  /** UI locale, so the share link opens in the asker's language. */
  locale: string;
}

export interface TranslateNowOutput {
  slug: string;
  target: string;
  lineCount: number;
  existing: boolean;
  /** The full song, in a link that never touches the server. */
  shareUrl: string | null;
}

export async function translateNowAction(
  input: TranslateNowInput,
): Promise<ActionResult<TranslateNowOutput>> {
  if (!isLanguageCode(input.source)) {
    return { ok: false, code: 'unsupported_language', field: 'source' };
  }
  if (!isTargetLanguage(input.target)) {
    return { ok: false, code: 'unsupported_language', field: 'targets' };
  }
  const lyrics = input.lyrics.trim();
  if (lyrics.length === 0) return { ok: false, code: 'empty_lyrics', field: 'lyrics' };

  const container = getContainer();
  const key = await submitterKey(await headers());

  const result = await translateNow(container, {
    title: input.title,
    artist: input.artist,
    source: input.source,
    target: input.target,
    lyrics,
    requesterAlias: input.requesterAlias?.trim() || null,
    requesterNote: input.requesterNote?.trim() || null,
    requestId: input.requestId ?? null,
    closeRequest: input.closeRequest === true,
    submitterKey: key,
  });

  if (!result.ok) {
    if (result.error.code === 'engine_failed') {
      // The detail is developer-facing; the log is where it is useful.
      console.error('[translate-now]', result.error.detail);
    }
    return { ok: false, code: result.error.code, field: result.error.field };
  }

  const { song } = result.value;
  const locale = (UI_LOCALES as readonly string[]).includes(input.locale) ? input.locale : 'en';
  const encoded = encodeSharePackage(toSharePackage(song));
  const shareUrl = encoded.ok ? buildShareUrl(siteUrl(), locale, encoded.value) : null;

  for (const code of UI_LOCALES) {
    revalidatePath(`/${code}`);
    revalidatePath(`/${code}/songs/${song.slug}`);
  }
  revalidatePath('/[locale]/requests', 'page');

  return {
    ok: true,
    data: {
      slug: song.slug,
      target: song.pair.target,
      lineCount: song.sections.reduce((n, s) => n + s.lines.length, 0),
      existing: result.value.existing,
      shareUrl,
    },
  };
}
