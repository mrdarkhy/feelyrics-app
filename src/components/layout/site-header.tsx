'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link, usePathname } from '@/i18n/navigation';
import { BrandLockup } from '@/components/brand/logo';
import { LocaleSwitcher } from './locale-switcher';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { href: '/', key: 'library' },
  { href: '/requests', key: 'requests' },
  { href: '/about', key: 'about' },
] as const;

function NavLinks({
  onNavigate,
  orientation,
}: {
  onNavigate?: () => void;
  orientation: 'horizontal' | 'vertical';
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <ul
      className={cn(
        'flex gap-1',
        orientation === 'vertical' ? 'flex-col' : 'items-center',
      )}
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              // `aria-current` is what tells a screen reader which page you are
              // on; colour alone only tells people who can see it.
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'block rounded-pill px-3 py-2 text-[14px] font-medium transition-colors',
                orientation === 'vertical' && 'text-[16px]',
                isActive
                  ? 'bg-amber-soft text-amber'
                  : 'text-bone-muted hover:bg-ground-raised hover:text-bone',
              )}
            >
              {t(item.key)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SiteHeader() {
  const t = useTranslations('nav');
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/85 backdrop-blur-md">
      {/* Matches the library's frame rather than the reading column, so the
          wordmark sits over the rail instead of floating away from it. */}
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-6">
        <Link
          href="/"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-amber"
        >
          <BrandLockup />
        </Link>

        <nav aria-label={t('primaryLabel')} className="ml-auto hidden md:block">
          <NavLinks orientation="horizontal" />
        </nav>

        <div className="ml-auto md:ml-2">
          <LocaleSwitcher />
        </div>

        {/* Mobile menu. A dialog rather than a hand-rolled drawer, so focus is
            trapped and Escape works without any of it being written here. */}
        <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogPrimitive.Trigger
            aria-label={t('openMenu')}
            className="rounded-lg border border-line p-2 text-bone-muted transition-colors hover:text-bone md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M2 4.5h14M2 9h14M2 13.5h14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </DialogPrimitive.Trigger>

          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-fade-in md:hidden" />
            <DialogPrimitive.Content
              className={cn(
                'fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col gap-6',
                'border-l border-line bg-panel p-5 shadow-sheet focus:outline-none md:hidden',
                'data-[state=open]:animate-slide-up',
              )}
            >
              <DialogPrimitive.Title className="sr-only">
                {t('primaryLabel')}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                {t('primaryLabel')}
              </DialogPrimitive.Description>

              <div className="flex items-center justify-between">
                <BrandLockup />
                <DialogPrimitive.Close
                  aria-label={t('closeMenu')}
                  className="rounded-lg border border-line p-2 text-bone-muted transition-colors hover:text-bone"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M1.5 1.5l11 11M12.5 1.5l-11 11"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </DialogPrimitive.Close>
              </div>

              <nav aria-label={t('primaryLabel')}>
                <NavLinks
                  orientation="vertical"
                  onNavigate={() => setMenuOpen(false)}
                />
              </nav>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    </header>
  );
}
