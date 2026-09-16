import { deflateSync, inflateSync } from 'fflate';
import { domainError, err, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/result';
import {
  MAX_ENCODED_SHARE_LENGTH,
  SHARE_FRAGMENT_PREFIX,
  fromSharePackage,
} from '@/domain/song/share-package';
import type { SharePackage, SharedSong } from '@/domain/song/share-package';

/**
 * The share-link codec.
 *
 * A whole song is deflated, base64url-encoded and put in the URL *fragment*.
 * Fragments are not sent with the HTTP request — the browser strips everything
 * after `#` before the bytes leave the machine — so the payload travels from the
 * sender's device straight to the reader's. It never reaches our server, our
 * logs or a CDN, which is what lets a complete translation be shared while the
 * pages we actually host stay within the two-line quote limit.
 *
 * `btoa`/`atob` are used rather than `Buffer` so the same module runs unchanged
 * in the browser, in Node and on the edge.
 */

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  // Chunked to stay clear of the argument-count ceiling on large payloads.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encodes a package into the `f1.<payload>` fragment body. */
export function encodeSharePackage(pkg: SharePackage): Result<string> {
  try {
    const json = JSON.stringify(pkg);
    const compressed = deflateSync(new TextEncoder().encode(json), { level: 9 });
    const encoded = `${SHARE_FRAGMENT_PREFIX}${toBase64Url(compressed)}`;

    if (encoded.length > MAX_ENCODED_SHARE_LENGTH) {
      return err(
        domainError(
          'share_payload_invalid',
          `encoded payload is ${encoded.length} characters, over the ${MAX_ENCODED_SHARE_LENGTH} limit`,
        ),
      );
    }

    return ok(encoded);
  } catch (error) {
    return err(
      domainError(
        'share_payload_invalid',
        error instanceof Error ? error.message : 'encoding failed',
      ),
    );
  }
}

/**
 * Decodes a fragment back into a song.
 *
 * Accepts a bare payload, a `#`-prefixed fragment or a whole URL, because people
 * paste all three. Anything that does not decode is rejected — this input is
 * attacker-controlled by definition.
 */
export function decodeSharePackage(input: string): Result<SharedSong> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return err(domainError('share_payload_invalid', 'empty payload'));
  }
  if (trimmed.length > MAX_ENCODED_SHARE_LENGTH + 2_000) {
    return err(domainError('share_payload_invalid', 'payload too large'));
  }

  const hashIndex = trimmed.lastIndexOf('#');
  const afterHash = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : trimmed;
  const body = afterHash.startsWith(SHARE_FRAGMENT_PREFIX)
    ? afterHash.slice(SHARE_FRAGMENT_PREFIX.length)
    : afterHash;

  if (!/^[A-Za-z0-9\-_]+$/.test(body)) {
    return err(domainError('share_payload_invalid', 'payload is not base64url'));
  }

  try {
    const json = new TextDecoder().decode(inflateSync(fromBase64Url(body)));
    return fromSharePackage(JSON.parse(json));
  } catch (error) {
    return err(
      domainError(
        'share_payload_invalid',
        error instanceof Error ? error.message : 'decoding failed',
      ),
    );
  }
}

/** The full URL a reader opens. `locale` keeps the UI in the sharer's language. */
export function buildShareUrl(
  origin: string,
  locale: string,
  fragment: string,
): string {
  return `${origin.replace(/\/+$/, '')}/${locale}/s#${fragment}`;
}
