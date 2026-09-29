import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The guards guard themselves.
 *
 * Packages arrive as zips, and a zip replaces whole files. That is exactly how a
 * protection gets removed by accident: a later package ships an older copy of
 * `package.json` or `vercel.json`, the gate quietly stops running, and nothing
 * fails to say so. These assertions fail instead.
 *
 * They check wiring, not behaviour — and they check two different gates, which
 * answer two different questions. Continuous integration says *this commit is
 * broken* after the fact; the deploy gate stops the broken commit from becoming
 * the live site. CI is checked only if its file is present, because it ships in
 * its own package and this one must not depend on that upload order.
 */

function read(relative: string): string {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
}

function exists(relative: string): boolean {
  return existsSync(new URL(`../../${relative}`, import.meta.url));
}

describe('verify script', () => {
  const packageJson = JSON.parse(read('package.json')) as {
    scripts?: Record<string, string>;
  };

  it('is the single gate: typecheck, lint, tests', () => {
    const verify = packageJson.scripts?.verify ?? '';
    expect(verify).toContain('typecheck');
    expect(verify).toContain('lint');
    expect(verify).toContain('test');
  });
});

describe('vercel build', () => {
  const vercelJson = JSON.parse(read('vercel.json')) as { buildCommand?: string };

  it('runs the gate before building, so a broken upload cannot reach production', () => {
    // Vercel keeps the last good deployment live when a build fails, which is
    // the behaviour being bought here: a half-uploaded package stops at the
    // build instead of replacing a working site.
    const buildCommand = vercelJson.buildCommand ?? '';
    expect(buildCommand).toContain('npm run verify');
    expect(buildCommand).toContain('npm run build');
    expect(buildCommand.indexOf('verify')).toBeLessThan(buildCommand.indexOf('run build'));
  });
});

describe('continuous integration', () => {
  it('still runs the unit tests, when its workflow is present', () => {
    // Ships in its own package; absent is not a failure here.
    if (!exists('.github/workflows/ci.yml')) return;
    const workflow = read('.github/workflows/ci.yml');
    expect(workflow).toMatch(/vitest|npm run test|npm run verify/);
  });
});
