import { NextResponse } from 'next/server';
import { isAdmin } from '@/infrastructure/auth/admin-session';
import { getDb } from '@/infrastructure/db/client';
import { auditSchema, driftSummary } from '@/infrastructure/db/schema-audit';
import { InMemoryRateLimiter } from '@/infrastructure/db/repositories/rate-limiter';

/**
 * Deploy health: does the database have what this build expects?
 *
 * The upload flow for this project is a zip dropped into GitHub's web UI, and
 * some packages owe a migration that is run by hand in the Neon SQL editor
 * afterwards. Forgetting that step produces the worst kind of failure: the build
 * is green, the pages render, and the one query that touches the new column
 * throws on a visitor rather than in a check. This endpoint is the third step of
 * such an upload — open it, see `ok`, and the migration is in.
 *
 * Two levels of answer. Anonymous callers get a verdict and a count: enough for
 * a person or an uptime check to know the deployment is healthy, without
 * publishing the table layout. A maintainer session gets the list of what is
 * missing, which is the part that says what to run.
 *
 * Failure is reported as 503 rather than 200, because a deployment whose
 * database is behind it is not serving correctly even while most pages look
 * fine — and an unreachable database is the same answer from the caller's side.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A speed bump, not a wall: the check is two cheap catalogue reads, but it does
 * open a database connection, and an unauthenticated endpoint that does so
 * should not be free to call in a loop.
 */
const limiter = new InMemoryRateLimiter();
const LIMIT = 60;
const WINDOW_MS = 60 * 60 * 1000;

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const forwarded = request.headers.get('x-forwarded-for');
  const key = forwarded?.split(',')[0]?.trim() ?? 'unknown';

  if (!(await limiter.check(key, LIMIT, WINDOW_MS))) {
    return noStore({ ok: false, code: 'rate_limited' }, 429);
  }

  const maintainer = await isAdmin();

  let drift;
  try {
    drift = await auditSchema(getDb());
  } catch {
    // The reason is deliberately not echoed back: a connection string, a host
    // name or a driver stack trace is not something an anonymous caller needs.
    return noStore({ ok: false, code: 'unreachable' }, 503);
  }

  if (drift.ok) {
    return noStore({ ok: true, missing: 0 }, 200);
  }

  if (!maintainer) {
    return noStore({ ok: false, code: 'schema_behind', missing: drift.missingCount }, 503);
  }

  return noStore(
    {
      ok: false,
      code: 'schema_behind',
      missing: drift.missingCount,
      missingTables: drift.missingTables,
      missingColumns: drift.missingColumns,
      missingEnums: drift.missingEnums,
      missingEnumValues: drift.missingEnumValues,
      detail: driftSummary(drift),
    },
    503,
  );
}
