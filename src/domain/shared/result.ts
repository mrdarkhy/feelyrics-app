/**
 * A tiny `Result` type so use cases can report failure without throwing.
 *
 * Exceptions are reserved for genuinely exceptional conditions (a database that
 * is unreachable, a bug). Expected outcomes — "that slug does not exist", "this
 * suggestion has no reason tag" — are values, and the type system forces the
 * caller to deal with them.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = DomainError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Unwrap a result, throwing if it failed. Only for code paths that already proved success. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(
    `Called unwrap() on a failed Result: ${JSON.stringify(result.error)}`,
  );
}

/**
 * Every failure carries a stable machine-readable `code`. The presentation layer
 * maps that code to a translated message — error strings are never authored in
 * the domain, because the domain does not know which language the reader speaks.
 */
export type DomainErrorCode =
  | 'not_found'
  | 'invalid_input'
  | 'forbidden'
  | 'conflict'
  | 'rate_limited'
  | 'unsupported_language'
  | 'empty_lyrics'
  | 'missing_reason_tag'
  | 'invalid_transition'
  | 'quote_limit_exceeded'
  | 'share_payload_invalid';

export interface DomainError {
  readonly code: DomainErrorCode;
  /** Developer-facing detail. Never rendered to end users verbatim. */
  readonly detail?: string;
  /** Field path, when the failure belongs to one input. */
  readonly field?: string;
}

export function domainError(
  code: DomainErrorCode,
  detail?: string,
  field?: string,
): DomainError {
  return { code, ...(detail ? { detail } : {}), ...(field ? { field } : {}) };
}
