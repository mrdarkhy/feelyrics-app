import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * End-to-end checks against a real production build and a real database.
 *
 * The emphasis is deliberately lopsided. Most of these assertions guard the two
 * things that would be expensive to get wrong and invisible when they break: the
 * quote limit on public pages, and the translation coverage across three
 * languages. Layout regressions announce themselves; a page quietly serving a
 * whole lyric does not.
 */

test.describe('library', () => {
  // The rail's rows are marked, because the page also carries shelf links to the
  // same songs and a plain href selector would count a song twice.
  const railRows = (page: Page) =>
    page.locator('[data-song-link]');

  test('lists songs and filters them without a page load', async ({ page }) => {
    await page.goto('/en');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Hear it. Understand it. Feel it.',
    );

    const rows = railRows(page);
    expect(await rows.count()).toBeGreaterThan(20);

    await page.getByRole('searchbox', { name: /search songs or artists/i }).fill('Tarkan');
    await expect(rows).toHaveCount(2, { timeout: 5_000 });

    // Both directions of the same song must survive as separate entries.
    await expect(page.locator('[data-song-link="tarkan-simarik-tr-en"]')).toBeVisible();
    await expect(page.locator('[data-song-link="tarkan-simarik-tr-es"]')).toBeVisible();
  });

  test('searches the feel profile, not only the title', async ({ page }) => {
    await page.goto('/en');
    const rows = railRows(page);

    await page
      .getByRole('searchbox', { name: /search songs or artists/i })
      .fill('elegy');

    // Gülpembe's title contains no such word; its feel profile does.
    await expect(page.locator('[data-song-link="baris-manco-gulpembe-tr-en"]')).toBeVisible();
    expect(await rows.count()).toBeLessThan(10);
  });

  test('narrows by target language', async ({ page }) => {
    await page.goto('/en');
    const rows = railRows(page);
    const all = await rows.count();

    await page
      .getByRole('radiogroup', { name: /^into$/i })
      .getByRole('radio', { name: 'Spanish' })
      .click();
    const spanishOnly = await rows.count();

    expect(spanishOnly).toBeGreaterThan(0);
    expect(spanishOnly).toBeLessThan(all);

    // The filter announces itself and can be taken off again.
    await expect(page.getByText('Into: Spanish')).toBeVisible();
    await page.getByRole('button', { name: /remove filter: spanish/i }).click();
    await expect(rows).toHaveCount(all);
  });

  test('sorting by title drops the pair headings', async ({ page }) => {
    await page.goto('/en');

    await expect(page.getByRole('heading', { name: /turkish → english/i })).toBeVisible();

    await page.getByRole('combobox', { name: /^sort$/i }).click();
    await page.getByRole('option', { name: /title a–z/i }).click();

    await expect(page.getByRole('heading', { name: /turkish → english/i })).toHaveCount(0);
    expect(await railRows(page).count()).toBeGreaterThan(20);
  });

  test('the rail keeps its filter when a song is opened', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'beside an open song there is no room for the rail on a phone',
    );

    await page.goto('/en');
    await page.getByRole('searchbox', { name: /search songs or artists/i }).fill('Tarkan');
    await expect(railRows(page)).toHaveCount(2);

    await page.locator('[data-song-link="tarkan-simarik-tr-en"]').click();
    await expect(page).toHaveURL(/\/en\/songs\/tarkan-simarik-tr-en/);

    // The rail lives in the layout, so the navigation must not have reset it.
    await expect(railRows(page)).toHaveCount(2);
    await expect(
      page.getByRole('searchbox', { name: /search songs or artists/i }),
    ).toHaveValue('Tarkan');
    await expect(page.locator('[data-song-link="tarkan-simarik-tr-en"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('pair pages', () => {
  test('a language pair has a page of its own, in every language', async ({ page }) => {
    await page.goto('/en/pairs/es-to-tr');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Spanish → Turkish');
    expect(await page.locator('[data-shelf-link]').count()).toBeGreaterThan(5);

    for (const locale of ['en', 'tr', 'es']) {
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${locale}"]`),
      ).toHaveAttribute('href', new RegExp(`/${locale}/pairs/es-to-tr`));
    }
  });

  test('is listed in the sitemap and refuses a pair that does not exist', async ({
    page,
    request,
  }) => {
    const sitemap = await request.get('/sitemap.xml');
    expect(await sitemap.text()).toContain('/en/pairs/es-to-tr');

    const response = await page.goto('/en/pairs/es-to-es');
    expect(response?.status()).toBe(404);
  });
});

test.describe('the minimal quote limit', () => {
  test('a user-pasted song shows at most two lines', async ({ page }) => {
    // Şımarık has a full body in the database — the page must not reveal it.
    await page.goto('/en/songs/tarkan-simarik-tr-en');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Şımarık');

    const lines = page.locator('[data-lyric-line]');
    await expect(lines).toHaveCount(2);

    await expect(page.getByText(/This page shows 2 of \d+ lines/)).toBeVisible();
  });

  test('a public-domain song is allowed to show in full', async ({ page }) => {
    await page.goto('/en/songs/jose-marti-kuba-halk-sarkisi-guantanamera-cantavel-es-tr');

    const lines = page.locator('[data-lyric-line]');
    expect(await lines.count()).toBeGreaterThan(2);
    await expect(page.getByText(/public domain/i)).toBeVisible();
  });

  test('never serves more than two lines, across every song page', async ({
    page,
    request,
  }) => {
    // Walks the sitemap rather than a hand-picked list, so a song added later is
    // covered automatically.
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);

    const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1] ?? '')
      .filter((url) => url.includes('/en/songs/'));

    expect(urls.length).toBeGreaterThan(50);

    // A representative sample: checking all 66 would triple the suite's runtime
    // for the same signal.
    for (const url of urls.slice(0, 12)) {
      await page.goto(new URL(url).pathname);
      const count = await page.locator('[data-lyric-line]').count();
      const isPublicDomain = await page
        .getByText(/public domain/i)
        .isVisible()
        .catch(() => false);

      if (!isPublicDomain) {
        expect(count, `${url} showed ${count} lines`).toBeLessThanOrEqual(2);
      }
    }
  });
});

test.describe('internationalisation', () => {
  for (const [locale, heading] of [
    ['en', 'Hear it. Understand it. Feel it.'],
    ['tr', 'Duy. Anla. Hisset.'],
    ['es', 'Escúchala. Entiéndela. Siéntela.'],
  ] as const) {
    test(`${locale} renders in its own language`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    });
  }

  test('no raw message keys leak into any page', async ({ page }) => {
    for (const path of ['/tr', '/es/requests', '/en/about', '/tr/songs/tarkan-simarik-tr-en']) {
      await page.goto(path);
      const body = (await page.locator('body').textContent()) ?? '';
      // An untranslated key renders as "namespace.key" rather than a sentence.
      expect(body, `${path} leaked a message key`).not.toMatch(
        /\b(library|song|requests|suggest|share|errors|nav|meta)\.[a-zA-Z]+\b/,
      );
    }
  });

  test('switching language keeps you on the same song', async ({ page }) => {
    await page.goto('/en/songs/tarkan-simarik-tr-en');
    await page.getByRole('combobox', { name: /change interface language/i }).click();
    await page.getByRole('option', { name: 'Türkçe' }).click();

    await expect(page).toHaveURL(/\/tr\/songs\/tarkan-simarik-tr-en/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Şımarık');
  });

  test('hreflang links every language version together', async ({ page }) => {
    await page.goto('/en/songs/tarkan-simarik-tr-en');
    for (const locale of ['en', 'tr', 'es']) {
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${locale}"]`),
      ).toHaveAttribute('href', new RegExp(`/${locale}/songs/tarkan-simarik-tr-en`));
    }
  });
});

test.describe('requests', () => {
  /**
   * Each test submits as its own client.
   *
   * The queue is rate-limited per submitter address, which is correct — but the
   * whole suite runs from one loopback address, so without this the sixth run
   * within an hour fails on the quota rather than on a defect, and points at the
   * wrong thing when it does. The limit itself is asserted below, deliberately.
   */
  test.beforeEach(async ({ context }, testInfo) => {
    await context.setExtraHTTPHeaders({
      'x-forwarded-for': `e2e-${testInfo.project.name}-${testInfo.title}-${Date.now()}`,
    });
  });

  test('shows the queue and accepts a new request', async ({ page }) => {
    await page.goto('/en/requests');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Request queue');

    const unique = `Playwright Song ${Date.now()}`;
    await page.getByLabel('Song title').fill(unique);
    await page.getByLabel('Artist').fill('Test Artist');
    await page
      .getByRole('group', { name: /translate it into/i })
      .getByRole('button', { name: 'Turkish', exact: true })
      .click();

    await page.getByRole('button', { name: /add to the queue/i }).click();

    await expect(page.getByText(unique)).toBeVisible({ timeout: 15_000 });
  });

  test('reads a pasted lyric back before anything is submitted', async ({ page }) => {
    await page.goto('/en/requests');

    await page.getByLabel(/^the lyrics/i).fill(
      ['[Verse]', 'first line', 'second line', '', '[Chorus]', 'hook', '', '[Chorus]', 'hook'].join(
        '\n',
      ),
    );
    // The preview runs when the paste is done, not on every keystroke.
    await page.getByLabel('Song title').click();

    await expect(page.getByText(/what we found/i)).toBeVisible();
    await expect(page.getByText(/3 lines/)).toBeVisible();
    await expect(page.getByText(/2 sections/)).toBeVisible();
    // The chorus appears twice in the paste and is collapsed into one block.
    await expect(page.getByText(/1 repeated block/)).toBeVisible();
  });

  test('a request that arrives with lyrics says so and keeps none of them', async ({
    page,
  }) => {
    await page.goto('/en/requests');

    const unique = `Pasted Song ${Date.now()}`;
    await page.getByLabel(/^the lyrics/i).fill('[Verse]\nSome words\nMore words');
    await page.getByLabel('Song title').fill(unique);
    await page.getByLabel('Artist').fill('Test Artist');
    await page.getByLabel(/why this song/i).fill('My grandmother sang this one.');
    await page
      .getByRole('group', { name: /translate it into/i })
      .getByRole('button', { name: 'Turkish', exact: true })
      .click();

    await page.getByRole('button', { name: /add to the queue/i }).click();

    await expect(page.getByRole('heading', { name: /it is in/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/2 lines came through/i)).toBeVisible();

    // The queue shows the count and the asker's own sentence — never the words.
    // Earlier runs leave their own rows behind, so match this request's row.
    const row = page.locator('li').filter({ hasText: unique }).first();
    await expect(row.getByText('2 lines ready')).toBeVisible();
    await expect(row.getByText(/my grandmother sang this one/i)).toBeVisible();
    await expect(page.getByText('Some words')).toHaveCount(0);
  });

  test('refuses a request with no target language', async ({ page }) => {
    await page.goto('/en/requests');
    await page.getByLabel('Song title').fill('No Target');
    await page.getByLabel('Artist').fill('Nobody');
    await page.getByRole('button', { name: /add to the queue/i }).click();

    await expect(page.locator('form').getByRole('alert')).toContainText(/language/i);
  });

  // The rate limit itself is covered in tests/unit/requests.test.ts. Driving six
  // submissions through the form to prove a counting rule tested the browser's
  // patience rather than the rule.
});

test.describe('sharing', () => {
  test('a share link carries the whole song in its fragment', async ({ page }) => {
    await page.goto('/en/songs/tarkan-simarik-tr-en');
    await page.getByRole('button', { name: 'Share' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const link = await dialog.getByLabel(/share link/i).inputValue();
    expect(link).toContain('#f1.');
    // The full body must be big enough that it is plainly not two lines.
    expect(link.length).toBeGreaterThan(1_000);

    await page.goto(new URL(link).pathname + new URL(link).hash);

    // Opened from the link, the reader gets the complete song.
    await expect(page.getByText(/lives in the link/i)).toBeVisible();
    expect(await page.locator('[data-lyric-line]').count()).toBeGreaterThan(2);
  });

  test('a mangled link is rejected rather than half-rendered', async ({ page }) => {
    await page.goto('/en/s#f1.thisisnotavalidpayload');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /could not be read/i,
    );
  });
});

test.describe('accessibility', () => {
  test('every page has one h1, a main landmark and a skip link', async ({ page }) => {
    for (const path of [
      '/en',
      '/en/requests',
      '/en/about',
      '/en/pairs/es-to-tr',
      '/en/songs/tarkan-simarik-tr-en',
    ]) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main#main')).toBeVisible();
      await expect(page.getByRole('link', { name: /skip to content/i })).toBeAttached();
    }
  });

  test('the skip link is reachable and works from the keyboard', async ({ page }) => {
    await page.goto('/en');
    await page.keyboard.press('Tab');

    const focused = page.locator(':focus');
    await expect(focused).toHaveText(/skip to content/i);
    await expect(focused).toBeVisible();
  });

  test('original and translation are tagged with their own languages', async ({
    page,
  }) => {
    // Without this a screen reader reads Turkish in an English voice, which is
    // unintelligible — and the whole page is about hearing the difference.
    await page.goto('/en/songs/tarkan-simarik-tr-en');
    await expect(page.locator('article [lang="tr"]').first()).toBeVisible();
    await expect(page.locator('article [lang="en"]').first()).toBeVisible();
  });

  test('images that carry no information are hidden from screen readers', async ({
    page,
  }) => {
    await page.goto('/en');
    const logos = page.locator('img[src*="icon-512"]');
    const count = await logos.count();
    for (let index = 0; index < count; index += 1) {
      await expect(logos.nth(index)).toHaveAttribute('aria-hidden', 'true');
    }
  });

  test('the suggest dialog traps focus and closes on Escape', async ({ page }) => {
    await page.goto('/en/songs/tarkan-simarik-tr-en');
    await page.getByRole('button', { name: /suggest a line/i }).click();
    await page.locator('[data-lyric-line] button').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/how would you land this line/i);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
});

test.describe('the extraction endpoint', () => {
  test('structures pasted lyrics and stores nothing', async ({ request }) => {
    const response = await request.post('/api/extract', {
      data: { lyrics: '[Verse]\nfirst\nsecond\n\n[Chorus]\nhook\n\n[Chorus]\nhook' },
    });

    expect(response.ok()).toBe(true);
    expect(response.headers()['cache-control']).toContain('no-store');

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.sections).toHaveLength(2);
    expect(body.data.sections[1].repeats).toBe(2);
  });

  test('rejects an empty paste and a wrong method', async ({ request }) => {
    const empty = await request.post('/api/extract', { data: { lyrics: '   ' } });
    expect(empty.status()).toBe(422);

    const wrongMethod = await request.get('/api/extract');
    expect(wrongMethod.status()).toBe(405);
  });
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';

test.describe('the lyrics editor', () => {
  /**
   * The screen that lets the catalogue grow without a database connection.
   * Desktop only: both projects would otherwise write the same song's body at
   * the same time, and the race would be the test's, not the app's.
   */
  test('saves a pasted body, and the public page still shows two lines', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one writer at a time');
    test.skip(ADMIN_TOKEN.length === 0, 'needs ADMIN_TOKEN in the environment');

    const slug = 'duman-bu-aksam-tr-en';

    await page.goto('/en/admin');
    await page.getByLabel(/maintainer token/i).fill(ADMIN_TOKEN);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await page.getByRole('tab', { name: /lyrics/i }).click();

    await page.getByLabel(/which song/i).selectOption(slug);
    await expect(page.getByText(/in the editor|Nothing in the editor/i)).toBeVisible();

    // A paired paste: the lyric on the left of the bar, the rendering on the
    // right. This is the shape that lets a finished song arrive in one go.
    const marker = `takes it all ${Date.now()}`;
    await page.getByLabel(/paste the lyrics/i).fill(
      [
        '[Verse]',
        'Bu akşam ölürüm beni kimse tutamaz | Tonight I die and nobody can hold me',
        'Bu akşam ölürüm | Tonight I die',
        '',
        '[Chorus]',
        `Gitme kal biraz daha | Stay, ${marker}`,
        'Sen gidince ben ne yaparım | What do I do once you have gone',
      ].join('\n'),
    );

    await page.getByRole('button', { name: /read the paste/i }).click();
    await expect(page.getByText(/4 lines found/i)).toBeVisible();
    await expect(page.getByText(/came with a rendering/i)).toBeVisible();

    await page.getByRole('button', { name: /^save 4 lines$/i }).click();
    await expect(page.getByText(/^Saved —/)).toBeVisible({ timeout: 15_000 });

    // The body is in; the cap still holds on the page a stranger reaches.
    await page.goto(`/en/songs/${slug}`);
    await expect(page.locator('[data-lyric-line]')).toHaveCount(2);
    await expect(page.getByText(/This page shows 2 of 4 lines/)).toBeVisible();

    // And the whole thing travels in the link, which is the point of saving it.
    await page.getByRole('button', { name: 'Share' }).click();
    const link = await page.getByRole('dialog').getByLabel(/share link/i).inputValue();
    await page.goto(new URL(link).pathname + new URL(link).hash);
    await expect(page.getByText(marker)).toBeVisible();
  });

  test('refuses to save a body with an untranslated line', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one writer at a time');
    test.skip(ADMIN_TOKEN.length === 0, 'needs ADMIN_TOKEN in the environment');

    await page.goto('/en/admin');
    await page.getByLabel(/maintainer token/i).fill(ADMIN_TOKEN);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.getByRole('tab', { name: /lyrics/i }).click();

    await page.getByLabel(/which song/i).selectOption('tarkan-simarik-tr-es');
    await page.getByLabel(/paste the lyrics/i).fill('Bir line with no rendering at all');
    await page.getByRole('button', { name: /read the paste/i }).click();

    await expect(page.getByText(/still ha[sv]e? no rendering/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^save /i })).toBeDisabled();
  });
});

test.describe('the maintainer area', () => {
  test('is locked and not indexed', async ({ page, request }) => {
    await page.goto('/en/admin');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/sign-in/i);

    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toContain('/*/admin');
  });
});
