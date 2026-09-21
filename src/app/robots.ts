import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Shared songs are personal and never the same twice; the maintainer
        // area and the API have nothing to index.
        //
        // Robots rules are prefix matches: a bare '/*/s' also blocks every
        // '/<locale>/songs/…' page. The '$' anchors the rule to the share page itself.
        disallow: ['/api/', '/*/s$', '/*/admin'],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
