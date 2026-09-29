'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { captureChannel } from '@/lib/channel';

/**
 * Reads `?src=` off whatever page the visit started on.
 *
 * Mounted in the locale layout so it covers every page, because the links that
 * carry a marker are song and pair pages, not the request form — the form is
 * where the marker is spent, several clicks later.
 *
 * It reads `window.location.search` instead of `useSearchParams`, on purpose:
 * that hook opts the whole subtree into client-side rendering unless every
 * static page wraps it in a Suspense boundary, and paying for a render mode
 * across the site to read one optional query parameter is a bad trade. Running
 * in an effect also keeps the markup identical on server and client, so nothing
 * here can cause a hydration mismatch.
 *
 * `usePathname` is a dependency rather than decoration: client-side navigation
 * does not remount the layout, so without it a visitor who lands on `/` and
 * then opens a marked link in the same session would never have it read.
 */
export function ChannelCapture() {
  const pathname = usePathname();

  React.useEffect(() => {
    captureChannel(window.location.search);
  }, [pathname]);

  return null;
}
