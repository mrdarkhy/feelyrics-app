import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware replacements for the Next.js navigation primitives. Importing
 * `Link` from here rather than from `next/link` is what keeps a click inside the
 * reader's language.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
