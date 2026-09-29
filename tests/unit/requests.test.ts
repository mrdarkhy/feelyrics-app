import { describe, expect, it } from 'vitest';
import {
  REQUEST_RATE_LIMIT,
  submitRequest,
  weeklyRequestsByChannel,
  type RequestsPort,
} from '@/application/use-cases/requests';
import { REQUEST_CHANNELS } from '@/domain/request/request-channel';
import { transition } from '@/domain/request/song-request';
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
    requesterNote: input.requesterNote,
    hasLyrics: input.hasLyrics,
    lyricLineCount: input.lyricLineCount,
    pastedLyrics: input.pastedLyrics,
    status: input.status,
    songSlug: null,
    channel: input.channel,
    readyAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };
}

function makeDeps(
  options: { duplicate?: SongRequest; channelTally?: Record<string, number> } = {},
) {
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
      findBySongSlug: async () => null,
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
      countByChannelSince: async () => options.channelTally ?? {},
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

  it('keeps the paste only while the request is open', async () => {
    const { deps, created } = makeDeps();

    await submitRequest(deps, { ...VALID, pastedLyrics: 'first line\nsecond line' });
    const row = created[0];
    if (!row) throw new Error('expected a row');
    expect(row.pastedLyrics).toBe('first line\nsecond line');

    // Marking it ready is what clears the words — the promise the form makes.
    const done = transition(row, 'ready', 'some-song-tr-en');
    expect(isOk(done)).toBe(true);
    if (isOk(done)) expect(done.value.pastedLyrics).toBeNull();

    const declined = transition(row, 'declined');
    expect(isOk(declined)).toBe(true);
    if (isOk(declined)) expect(declined.value.pastedLyrics).toBeNull();
  });

  it('will not hold a paste for a request that came without lyrics', async () => {
    const { deps, created } = makeDeps();

    await submitRequest(deps, {
      ...VALID,
      hasLyrics: false,
      pastedLyrics: 'words nobody confirmed',
    });

    expect(created[0]?.pastedLyrics).toBeNull();
  });

  it('folds a second ask for the same song into the existing row', async () => {
    const existing = fakeRequest(
      {
        title: VALID.title,
        artist: VALID.artist,
        targets: ['en'],
        requesterAlias: null,
        requesterNote: null,
        hasLyrics: false,
        lyricLineCount: null,
        pastedLyrics: null,
        status: 'lyrics-needed',
        channel: 'direct',
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


describe('request channels', () => {
  it('stores a known marker and defaults an absent one to direct', async () => {
    const { deps, created } = makeDeps();

    await submitRequest(deps, { ...VALID, channel: 'tt' });
    await submitRequest(deps, { ...VALID, title: 'Another song' });

    expect(created[0]?.channel).toBe('tt');
    expect(created[1]?.channel).toBe('direct');
  });

  it('folds a marker nobody planned into `other` rather than trusting it', async () => {
    const { deps, created } = makeDeps();

    // The value a stranger can put in the URL never reaches the column as typed.
    await submitRequest(deps, { ...VALID, channel: '<script>tiktok' });

    expect(created[0]?.channel).toBe('other');
  });

  it('normalises case and spacing, so one channel is one row in the tally', async () => {
    const { deps, created } = makeDeps();

    await submitRequest(deps, { ...VALID, channel: '  TT ' });

    expect(created[0]?.channel).toBe('tt');
  });

  it('reports every channel for the week, including the ones at zero', async () => {
    const { deps } = makeDeps({ channelTally: { tt: 4, direct: 2 } });

    const rows = await weeklyRequestsByChannel(deps);

    expect(rows[0]).toEqual({ channel: 'tt', count: 4 });
    expect(rows[1]).toEqual({ channel: 'direct', count: 2 });
    expect(rows).toHaveLength(REQUEST_CHANNELS.length);
    expect(rows.filter((row) => row.count === 0).length).toBe(
      REQUEST_CHANNELS.length - 2,
    );
  });
});

describe('time to ready', () => {
  const base: SongRequest = {
    ...fakeRequest(
      {
        title: 'Gülpembe',
        artist: 'Barış Manço',
        targets: ['en'],
        requesterAlias: null,
        requesterNote: null,
        hasLyrics: true,
        lyricLineCount: 12,
        pastedLyrics: 'a line',
        status: 'queued',
        channel: 'tt',
      },
      'req-ready',
    ),
  };

  it('stamps readyAt the first time a request lands', () => {
    const landed = transition(base, 'ready', 'gulpembe-tr-en');

    expect(isOk(landed)).toBe(true);
    if (!isOk(landed)) return;
    expect(landed.value.readyAt).toBeInstanceOf(Date);
    // The words go at the same moment, which is the promise the form makes.
    expect(landed.value.pastedLyrics).toBeNull();
  });

  it('keeps the first stamp when a landed request is reopened and lands again', () => {
    const first = transition(base, 'ready', 'gulpembe-tr-en');
    if (!isOk(first)) throw new Error('expected the first landing to be legal');

    const reopened = transition(first.value, 'queued');
    if (!isOk(reopened)) throw new Error('expected reopening to be legal');

    const again = transition(reopened.value, 'ready', 'gulpembe-tr-en');
    if (!isOk(again)) throw new Error('expected the second landing to be legal');

    expect(again.value.readyAt).toEqual(first.value.readyAt);
  });

  it('leaves readyAt empty while the request is still open', () => {
    const declined = transition(base, 'declined');

    expect(isOk(declined)).toBe(true);
    if (!isOk(declined)) return;
    expect(declined.value.readyAt).toBeNull();
  });
});
