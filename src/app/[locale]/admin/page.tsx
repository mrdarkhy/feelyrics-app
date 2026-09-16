import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/infrastructure/container';
import { isAdmin } from '@/infrastructure/auth/admin-session';
import { listSuggestions } from '@/application/use-cases/suggestions';
import { listQueue } from '@/application/use-cases/requests';
import { toRequestView } from '@/lib/view-models';
import { serverEnv } from '@/lib/env';
import { AdminLogin } from '@/components/admin/admin-login';
import { AdminDashboard } from '@/components/admin/admin-dashboard';
import type { SuggestionView } from '@/components/admin/admin-dashboard';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The maintainer area reads a session cookie, so it can never be static.
 */
export const dynamic = 'force-dynamic';

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const authorised = await isAdmin();

  if (!authorised) {
    return <AdminLogin configured={Boolean(serverEnv().ADMIN_TOKEN)} />;
  }

  const container = getContainer();
  const [proposed, requests] = await Promise.all([
    listSuggestions(container, { status: 'proposed' }),
    listQueue(container, { includeDeclined: true }),
  ]);

  const suggestions: SuggestionView[] = proposed.map((suggestion) => ({
    id: suggestion.id,
    songId: suggestion.songId,
    lineId: suggestion.lineId,
    originalLine: suggestion.originalLine,
    engineDraft: suggestion.engineDraft,
    proposedRendering: suggestion.proposedRendering,
    tags: suggestion.tags,
    comment: suggestion.comment,
    contributorAlias: suggestion.contributorAlias,
    status: suggestion.status,
    createdAt: suggestion.createdAt.toISOString(),
  }));

  return (
    <AdminDashboard
      suggestions={suggestions}
      requests={requests.map(toRequestView)}
    />
  );
}
