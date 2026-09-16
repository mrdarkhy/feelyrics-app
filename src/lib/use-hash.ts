'use client';

import * as React from 'react';

/**
 * The current URL fragment, as an external store.
 *
 * The fragment is where a shared song lives, and it is genuinely external state:
 * it changes through browser navigation rather than through React. Subscribing
 * to `hashchange` is therefore the honest model — and it avoids the read-in-
 * effect-then-set-state pattern that costs a second render on every page view.
 *
 * The server snapshot is an empty string, which is exactly right: the server is
 * never sent the fragment, so it cannot know it, and pretending otherwise would
 * be a hydration mismatch.
 */

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

function getSnapshot(): string {
  return window.location.hash.slice(1);
}

function getServerSnapshot(): string {
  return '';
}

export function useHash(): string {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
