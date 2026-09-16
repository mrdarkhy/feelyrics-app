import Link from 'next/link';

/**
 * The global 404, for addresses with no locale at all (`/nonsense`).
 *
 * It cannot use `next-intl`, because outside a locale segment there is no
 * request locale to translate against — so it stays deliberately wordless and
 * points at the default language.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b1511',
          color: '#eaefe4',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.75rem' }}>Not found</h1>
          <Link href="/en" style={{ color: '#e5a943' }}>
            Feelyrics
          </Link>
        </div>
      </body>
    </html>
  );
}
