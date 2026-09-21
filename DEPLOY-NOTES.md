# D13 — Deep links `#s=<song-id>` (2026-09-21)

Upload both files to the repo root (replace existing): `app.js`, `sw.js`.

## What changes
- `https://mrdarkhy.github.io/feelyrics/#s=<song-id>` opens that song directly
  (ids are the `"id"` values in `songs.js`, e.g. `#s=gulpembe-tr-en`).
- Arriving via a deep link (`#s=` or `#f1.`) skips the intro — search visitors land straight on the song.
- Picking a song in the library rewrites the URL to `#s=<id>` (bookmarkable / shareable, no reload).
- The browser tab title follows the current song: `Title – Artist (PAIR) · Feelyrics`.
- Unknown id → default song + a "Request a song" hint (no blank screen).
- Bug fix: songs opened from personal `#f1.` links were never remembered after reload
  (filter still used the old Turkish group label). Now they persist on the device again.
- `sw.js`: cache name bumped to `feelyrics-v4`.

## Static song pages (D12 generator)
When `tools/build-song-pages.mjs` is uploaded, its "open in player" link should point to
`../#s=${id}` instead of `../`. Personal full-song links keep using `#f1.` unchanged.

## Test (done before delivery)
Chromium, local server: `#s=homem-amarelo-ptbr-en`, `#s=gulpembe-tr-en`, unknown id, no hash,
library click, and `hashchange` navigation — all correct, zero page errors.
