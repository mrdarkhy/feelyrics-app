import { getDb } from '../src/infrastructure/db/client';
import { auditSchema, driftSummary } from '../src/infrastructure/db/schema-audit';

/**
 * The same schema check as `/api/health/schema`, as an exit code.
 *
 * Continuous integration runs this against a throwaway Postgres that has had
 * `drizzle/` applied to it. That makes the pair of questions explicit: do the
 * committed migrations produce the schema the code expects (CI answers this),
 * and has the production database had them applied (the endpoint answers that).
 *
 * Usage: DATABASE_URL=... npx tsx scripts/audit-schema.ts
 */
async function main(): Promise<void> {
  const drift = await auditSchema(getDb());
  console.log(driftSummary(drift));

  if (!drift.ok) {
    console.error(
      '\nThe migration in drizzle/ does not create everything schema.ts declares.\n' +
        'Generate it with: npm run db:generate  (then commit the new file in drizzle/)',
    );
    // postgres-js keeps its socket open, so the process needs to be told to end.
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('Schema audit could not run:', error);
  process.exit(1);
});
