import { z } from 'zod';

/**
 * Environment variables, validated once at module load.
 *
 * A missing `DATABASE_URL` should stop the process with a sentence a
 * non-technical operator can act on, not surface as a connection error three
 * layers down at the first request.
 */

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required — paste the connection string from Neon.')
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      'DATABASE_URL must be a PostgreSQL connection string.',
    ),
  ADMIN_TOKEN: z
    .string()
    .min(24, 'ADMIN_TOKEN must be at least 24 characters. Generate one with: openssl rand -base64 32')
    .optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url('NEXT_PUBLIC_SITE_URL must be a full URL, e.g. https://feelyrics.vercel.app')
    .default('http://localhost:3000'),
  NEXT_PUBLIC_REQUEST_FORM_URL: z.string().url().or(z.literal('')).default(''),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

let cachedServerEnv: ServerEnv | null = null;

/**
 * Server-only configuration. Deliberately lazy: importing a module should not
 * crash a build step that never talks to the database, such as generating the
 * static shell of a page.
 */
export function serverEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment configuration:\n${formatIssues(parsed.error)}\n\n` +
        'Copy .env.example to .env.local and fill it in, or set these in the Vercel dashboard.',
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/**
 * Values safe to reach the browser. Read eagerly, because Next.js inlines
 * `NEXT_PUBLIC_*` at build time and a lazy read would see `undefined` in client
 * bundles.
 */
export const clientEnv: ClientEnv = (() => {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_REQUEST_FORM_URL: process.env.NEXT_PUBLIC_REQUEST_FORM_URL ?? '',
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment configuration:\n${formatIssues(parsed.error)}`,
    );
  }

  return parsed.data;
})();

/** Canonical origin without a trailing slash, for links, sitemap and metadata. */
export function siteUrl(): string {
  return clientEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
}
