import type { ReactNode } from 'react';

/**
 * Everything that is not the library: a centred column, the shape long-form
 * text wants. The library has its own layout because it is a browsing surface
 * rather than a reading one.
 */
export default function PagesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fl-enter mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {children}
    </div>
  );
}
