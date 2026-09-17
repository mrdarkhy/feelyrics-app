import { describe, expect, it } from 'vitest';
import {
  REQUEST_RATE_LIMIT,
  submitRequest,
  type RequestsPort,
} from '@/application/use-cases/requests';
import type { SongRequest, ValidatedRequest } from '@/domain/request/song-request';
import { isErr, isOk } from '@/domain/shared/result';

/**
 * The submit path, against fakes.
 *
 * This is the layer the rules actually live at, so it is the layer to test them
 * at: no browser, no database, no clock to wait out. The ports exist precisely
 * so that "the sixth request in an hour is refused" can be asserted in a
 * millisecond instead of by filling in a form six times.
 */

function fakeRequest(input: ValidatedRequest, id: string): SongRequest {
  return {
    id,
    title: input.title,
    artist: input.artist,
    targets: input.targets,
    requesterAlias: input.requesterAlias,
    hasLyrics: input.hasLyrics,
    status: input.status,
    songSlug: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };
}

function makeDeps(options: { duplicate?: SongRequest } = {}) {
  const created: SongRequest[] = [];
  const saved: SongRequest[] = [];
  const counted = new Map<string, number>();

  const deps: RequestsPort = {
    clock: { now: () => new Date('2026-09-17T12:00:00Z') },

    // A counting limiter, exactly like the Postgres one but in a Map.
    rateLimiter: {
      check: async (key, limit) => {
        const used = counted.get(key) ?? 0;
        if (used >= limit) return false;
        counted.set(key, used + 1);
        return true;
      },
    },

    requests: {
      list: async () => [],
      findById: async () => null,
      create: async (input) => {
        const row = fakeRequest(input, `req-${created.length + 1}`);
        created.push(row);
        return row;
      },
      save: async (request) => {
        saved.push(request);
        return request;
      },
      findRecentDuplicate: async () => options.duplicate ?? null,
      countSince: async () => 0,
    },
  };

  return { deps, created, saved };
}

const VALID = {
  title: 'Bir Derdim Var',
  artist: 'Mor ve Ötesi',
  targets: ['en'],
  submitterKey: 'submitter-a',
  hasLyrics: true,
} as const;

describe('submitRequest', () => {
  it('accepts a well-formed request', async () => {
    const { deps, created } = makeDeps();

    const result = await submitRequest(deps, VALID);

    expect(isOk(result)).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]?.status).toBe('queued');
  });

  it('derives lyrics-needed when no lyrics came with it', async () => {
    const { deps, created } = makeDeps();

    await submitRequest(deps, { ...VALID, hasLyrics: false });

    expect(created[0]?.status).toBe('lyrics-needed');
  });

  it('refuses the request after the limit and keeps refusing', async () => {
    const { deps, created } = makeDeps();

    for (let n = 0; n < REQUEST_RATE_LIMIT; n += 1) {
      const allowed = await submitRequest(deps, { ...VALID, title: `Song ${n}` });
      expect(isOk(allowed), `request ${n + 1} should have been allowed`).toBe(true);
    }

    const refused = await submitRequest(deps, { ...VALID, title: 'One too many' });

    expect(isErr(refused)).toBe(true);
    if (isErr(refused)) expect(refused.error.code).toBe('rate_limited');
    // The refusal must not have written anything.
    expect(created).toHaveLength(REQUEST_RATE_LIMIT);
  });

  it('counts each submitter separately', async () => {
    const { deps } = makeDeps();

    for (let n = 0; n < REQUEST_RATE_LIMIT; n += 1) {
      await submitRequest(deps, { ...VALID, title: `Song ${n}` });
    }

    const other = await submitRequest(deps, {
      ...VALID,
      submitterKey: 'submitter-b',
      title: 'From somebody else',
    });

    expect(isOk(other)).toBe(true);
  });

  it('is checked before anything is written, not after', async () => {
    // A limiter that refuses immediately: nothing may reach the repository.
    const { deps, created, saved } = makeDeps();
    const refusing: RequestsPort = {
      ...deps,
      rateLimiter: { check: async () => false },
    };

    const result = await submitRequest(refusing, VALID);

    expect(isErr(result)).toBe(true);
    expect(created).toHaveLength(0);
    expect(saved).toHaveLength(0);
  });

  it('rejects a malformed request before spending any quota', async () => {
    const { deps } = makeDeps();

    const result = await submitRequest(deps, { ...VALID, targets: [] });
    expect(isErr(result)).toBe(true);

    // Validation happens first, so the five allowances are all still there.
    for (let n = 0; n < REQUEST_RATE_LIMIT; n += 1) {
      const allowed = await submitRequest(deps, { ...VALID, title: `Song ${n}` });
      expect(isOk(allowed)).toBe(true);
    }
  });

  it('folds a second ask for the same song into the existing row', async () => {
    const existing = fakeRequest(
      {
        title: VALID.title,
        artist: VALID.artist,
        targets: ['en'],
        requesterAlias: null,
        hasLyrics: false,
        status: 'lyrics-needed',
      },
      'req-existing',
    );

    const { deps, created, saved } = makeDeps({ duplicate: existing });

    const result = await submitRequest(deps, VALID);

    expect(isOk(result)).toBe(true);
    expect(created).toHaveLength(0);
    // The asker brought lyrics, so the waiting request moves forward.
    expect(saved).toHaveLength(1);
    expect(saved[0]?.status).toBe('queued');
  });
});
