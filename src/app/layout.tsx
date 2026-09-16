import type { ReactNode } from 'react';
import './globals.css';

/**
 * The root layout exists only to satisfy Next.js, which requires one at the
 * top of the tree. Everything real — `<html>`, `<body>`, providers, chrome —
 * lives in `[locale]/layout.tsx`, because none of it can be rendered before the
 * language is known.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
