'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import type { SongSummaryView } from '@/lib/view-models';
import { LibraryRail } from './library-rail';
import { cn } from '@/lib/cn';

/**
 * The two-pane frame: catalogue on the left, whatever you opened on the right.
 *
 * On a narrow screen the two panes become one column, and the order flips — the
 * pane goes first so the page opens on its heading rather than on a list of
 * sixty songs. A song page hides the rail on mobile entirely; there is no room
 * for both, and the song page carries its own way back.
 *
 * The rail is rendered once, here in the layout, so navigating between songs
 * never remounts it. That is the whole reason this component exists.
 */
export function LibraryShell({
  songs,
  children,
}: {
  songs: readonly SongSummaryView[];
  children: ReactNode;
}) {
  const t = useTranslations('library');
  const pathname = usePathname();

  const match = /^\/songs\/([^/?#]+)/.exec(pathname);
  const activeSlug = match?.[1] ?? null;
  const songOpen = activeSlug !== null;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col lg:flex-row lg:items-start">
      <aside
        aria-label={t('railLabel')}
        className={cn(
          'order-2 w-full border-t border-line lg:order-1 lg:w-[22rem] lg:shrink-0',
          'lg:border-r lg:border-t-0',
          songOpen && 'hidden lg:block',
        )}
      >
        <div className="lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)]">
          <LibraryRail songs={songs} activeSlug={activeSlug} />
        </div>
      </aside>

      <div className="order-1 min-w-0 flex-1 px-4 py-8 sm:px-6 lg:order-2 lg:px-10 lg:py-10">
        {children}
      </div>
    </div>
  );
}
