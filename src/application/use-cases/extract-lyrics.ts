import { domainError, err, isErr, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/result';
import { extractLyrics } from '@/domain/lyrics/extract';
import type { ExtractionResult } from '@/domain/lyrics/extract';
import type { RateLimiter } from '../ports/repositories';

export interface ExtractLyricsPort {
  readonly rateLimiter: RateLimiter;
}

export const EXTRACT_RATE_LIMIT = 60;
export const EXTRACT_RATE_WINDOW_MS = 60 * 60 * 1000;

export interface ExtractLyricsCommand {
  readonly lyrics: string;
  readonly submitterKey: string;
}

/**
 * Structures pasted lyrics.
 *
 * Nothing is stored. The text arrives, comes back with a shape, and is gone —
 * which is both the privacy posture and the copyright one: the app has no
 * corpus of lyrics because it never keeps what it is shown here.
 */
export async function extractLyricsUseCase(
  deps: ExtractLyricsPort,
  command: ExtractLyricsCommand,
): Promise<Result<ExtractionResult>> {
  const allowed = await deps.rateLimiter.check(
    `extract:${command.submitterKey}`,
    EXTRACT_RATE_LIMIT,
    EXTRACT_RATE_WINDOW_MS,
  );
  if (!allowed) {
    return err(domainError('rate_limited', 'too many extraction requests'));
  }

  const result = extractLyrics(command.lyrics);
  if (isErr(result)) return result;

  return ok(result.value);
}
