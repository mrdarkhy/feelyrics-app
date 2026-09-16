/**
 * Loads the imported catalogue into PostgreSQL.
 *
 * Idempotent: a song already present is replaced wholesale rather than
 * duplicated, so the script can be re-run after editing the seed file without
 * anybody having to clear the database first.
 *
 *   npm run db:seed
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/infrastructure/db/schema';
import { songs, sections, lines, songRequests } from '../src/infrastructure/db/schema';
import { SEED_SONGS } from '../src/infrastructure/db/seed-data';
import { violatesQuoteLimit } from '../src/domain/song/minimal-quote.policy';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    'DATABASE_URL is not set.\n' +
      'Copy .env.example to .env.local, paste your Neon connection string, and try again.',
  );
  process.exit(1);
}

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client, { schema, casing: 'snake_case' });

/**
 * The first rows of the request queue.
 *
 * These are the founder's own pool picks — songs waiting on somebody to bring
 * their words. Seeding them means the queue is not an empty box on day one,
 * which is the difference between "nobody uses this" and "here is what is next".
 */
const SEED_REQUESTS = [
  { title: 'Sebebi Yar', artist: 'BLOK3', targets: ['en', 'es'] },
  { title: 'Kayıp Kalp', artist: 'BLOK3', targets: ['en', 'es'] },
  { title: 'Çok Güzel Gülüyorsun', artist: 'BLOK3 & Poizi', targets: ['en', 'es'] },
  { title: 'Ah Be Manolya', artist: 'Burak Bulut', targets: ['en', 'es'] },
  { title: 'Toz Pembe', artist: 'manifest', targets: ['en', 'es'] },
  { title: 'karambol', artist: 'Murda & Motive', targets: ['en', 'es'] },
  { title: 'Gamsız Hayat', artist: 'Candan Erçetin', targets: ['en', 'es'] },
  { title: 'YIN YANG', artist: 'Motive', targets: ['en', 'es'] },
] as const;

function dedupeKey(title: string, artist: string): string {
  return `${title} ${artist}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

async function main(): Promise<void> {
  console.log(`Seeding ${SEED_SONGS.length} songs…`);

  // Guard before writing anything: a song whose provenance says "user-paste"
  // while carrying a full body is exactly the mistake the quote policy exists to
  // prevent, and the seed file is the likeliest place for it to sneak in.
  const overLimit = SEED_SONGS.filter((song) =>
    violatesQuoteLimit({
      provenance: song.provenance,
      sections: song.sections.map((section) => ({
        id: '',
        position: section.position,
        label: section.label,
        lines: section.lines.map((line) => ({
          id: '',
          position: line.position,
          original: line.original,
          rendering: line.rendering,
          note: line.note,
          tags: line.tags,
        })),
      })),
    }),
  );

  if (overLimit.length > 0) {
    console.log(
      `  ${overLimit.length} song(s) carry a full body. They will be stored in full and\n` +
        '  served as two-line excerpts on public pages, per the minimal-quote policy.',
    );
  }

  let inserted = 0;

  for (const song of SEED_SONGS) {
    await db.transaction(async (tx) => {
      // Cascades take the sections and lines with it.
      await tx.delete(songs).where(eq(songs.slug, song.slug));

      const [songRow] = await tx
        .insert(songs)
        .values({
          slug: song.slug,
          title: song.title,
          artist: song.artist,
          sourceLanguage: song.source,
          targetLanguage: song.target,
          engineVersion: song.engineVersion,
          feelProfile: song.feelProfile,
          provenance: song.provenance,
          requestedBy: song.requestedBy,
          validatedBy: song.validatedBy,
        })
        .returning();

      if (!songRow) throw new Error(`Failed to insert ${song.slug}`);

      for (const section of song.sections) {
        const [sectionRow] = await tx
          .insert(sections)
          .values({
            songId: songRow.id,
            position: section.position,
            label: section.label,
          })
          .returning();

        if (!sectionRow) throw new Error(`Failed to insert section for ${song.slug}`);
        if (section.lines.length === 0) continue;

        await tx.insert(lines).values(
          section.lines.map((line) => ({
            sectionId: sectionRow.id,
            position: line.position,
            original: line.original,
            rendering: line.rendering,
            note: line.note,
            tags: line.tags,
          })),
        );
      }
    });

    inserted += 1;
    if (inserted % 10 === 0) {
      console.log(`  ${inserted}/${SEED_SONGS.length}`);
    }
  }

  console.log(`Seeded ${inserted} songs.`);

  const existingRequests = await db.select({ key: songRequests.dedupeKey }).from(songRequests);
  const seen = new Set(existingRequests.map((row) => row.key));

  const newRequests = SEED_REQUESTS.filter(
    (request) => !seen.has(dedupeKey(request.title, request.artist)),
  );

  if (newRequests.length > 0) {
    await db.insert(songRequests).values(
      newRequests.map((request) => ({
        title: request.title,
        artist: request.artist,
        targets: [...request.targets],
        hasLyrics: false,
        status: 'lyrics-needed' as const,
        dedupeKey: dedupeKey(request.title, request.artist),
      })),
    );
    console.log(`Seeded ${newRequests.length} queue entries.`);
  }

  await client.end();
}

main().catch(async (error) => {
  console.error('Seeding failed:', error);
  await client.end();
  process.exit(1);
});
