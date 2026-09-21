'use client';

/**
 * The Spotify iFrame API, typed and loaded once.
 *
 * Spotify's embed can be driven from the page: it reports playback position
 * while a track plays, which is all the sync needs. No app registration, no
 * quota, no Premium requirement on our side — a listener without Premium hears
 * the 30-second preview, which is the embed's own rule and is said on the
 * panel. This is the one Spotify surface that stays open to a small site, so
 * it is the one we lean on.
 */

export interface PlaybackUpdate {
  readonly position: number;
  readonly duration: number;
  readonly isPaused: boolean;
  readonly isBuffering: boolean;
}

export interface EmbedController {
  loadUri(uri: string): void;
  play(): void;
  togglePlay(): void;
  seek(seconds: number): void;
  destroy(): void;
  addListener(event: 'playback_update', listener: (event: { data: PlaybackUpdate }) => void): void;
  addListener(event: 'ready', listener: () => void): void;
  removeListener(event: 'playback_update' | 'ready'): void;
}

interface IFrameApi {
  createController(
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number },
    callback: (controller: EmbedController) => void,
  ): void;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: IFrameApi) => void;
    __feelyricsSpotifyApi?: IFrameApi;
  }
}

const SCRIPT_SRC = 'https://open.spotify.com/embed/iframe-api/v1';

let pending: Promise<IFrameApi> | null = null;

/** Resolves with the API, injecting the script on first use. */
export function loadSpotifyIframeApi(): Promise<IFrameApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.__feelyricsSpotifyApi) return Promise.resolve(window.__feelyricsSpotifyApi);
  if (pending) return pending;

  pending = new Promise<IFrameApi>((resolve, reject) => {
    const previous = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      window.__feelyricsSpotifyApi = api;
      previous?.(api);
      resolve(api);
    };

    if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onerror = () => {
        pending = null;
        reject(new Error('spotify iframe api failed to load'));
      };
      document.head.appendChild(script);
    }
  });

  return pending;
}
