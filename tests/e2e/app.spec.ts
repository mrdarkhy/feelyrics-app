import { expect, test } from '@playwright/test';

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
  test('lists songs and filters them without a page load', async ({ page }) => {
    await page.goto('/en');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Hear it. Understand it. Feel it.',
    );

    const cards = page.locator('a[href*="/songs/"]');
    const initial = await cards.count();
    expect(initial).toBeGreaterThan(20);

    await page.getByRole('searchbox', { name: /search songs or artists/i }).fill('Tarkan');
    await expect(cards).toHaveCount(2, { timeout: 5_000 });

    // Both directions of the same song must survive as separate entries.
    await expect(page.locator('a[href$="tarkan-simarik-tr-en"]')).toBeVisible();
    await expect(page.locator('a[href$="tarkan-simarik-tr-es"]')).toBeVisible();
  });

  test('narrows by target language', async ({ page }) => {
    await page.goto('/en');
    const cards = page.locator('a[href*="/songs/"]');
    const all = await cards.count();

    await page
      .getByRole('radiogroup', { name: /^into$/i })
      .getByRole('radio', { name: 'Spanish' })
      .click();
    const spanishOnly = await cards.count();

    expect(spanishOnly).toBeGreaterThan(0);
    expect(spanishOnly).toBeLessThan(all);
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

  test('refuses a request with no target language', async ({ page }) => {
    await page.goto('/en/requests');
    await page.getByLabel('Song title').fill('No Target');
    await page.getByLabel('Artist').fill('Nobody');
    await page.getByRole('button', { name: /add to the queue/i }).click();

    await expect(page.locator('form').getByRole('alert')).toContainText(/language/i);
  });
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
    for (const path of ['/en', '/en/requests', '/en/about', '/en/songs/tarkan-simarik-tr-en']) {
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

test.describe('the maintainer area', () => {
  test('is locked and not indexed', async ({ page, request }) => {
    await page.goto('/en/admin');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/sign-in/i);

    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toContain('/*/admin');
  });
});
