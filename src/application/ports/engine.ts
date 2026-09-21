import type { EngineBrief } from '@/domain/song/engine-output';

/**
 * The transcreation engine, as the application sees it.
 *
 * It takes a brief — numbered lines plus what little context the asker gave —
 * and returns whatever the model said, unparsed. Deciding whether that reply is
 * a song body belongs to the domain (`assembleEngineDraft`), so an adapter here
 * cannot accidentally become the place where the rules live.
 */
export interface TranscreationEngine {
  /** Which model/prompt produced the draft — stamped on the song. */
  readonly version: string;
  /** The raw reply. Throws only on transport failure. */
  draft(brief: EngineBrief): Promise<string>;
}
