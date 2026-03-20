import { test, expect } from '@playwright/test';

// Admin page (/admin) — source management behind iron-session auth.
// The page itself has not yet been built (app/admin/ is an empty directory),
// so most tests use test.skip guards and document the expected behaviour
// when the page is implemented.
//
// Tests that verify the *auth API* responses can run without the page.

test.describe('Admin auth API', () => {
  test('POST /api/auth/login returns 401 for wrong password', async ({ page }) => {
    // Intercept the login API call at the network level
    let loginStatus: number | undefined;

    // Navigate somewhere first so we have a page context
    await page.route('/api/feed*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ articles: [], nextCursor: null }) });
    });
    await page.route('/api/sources*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('/api/reading-points*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/');

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'definitelywrongpassword' }),
      });
      return res.status;
    });

    // The real API returns 401 for wrong passwords (iron-session auth)
    expect(response).toBe(401);
  });

  test('POST /api/auth/logout returns 200', async ({ page }) => {
    await page.route('/api/feed*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ articles: [], nextCursor: null }) });
    });
    await page.route('/api/sources*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('/api/reading-points*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/');

    const status = await page.evaluate(async () => {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      return res.status;
    });

    expect(status).toBe(200);
  });

  test('POST /api/sources without auth cookie returns 401', async ({ page }) => {
    await page.route('/api/feed*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ articles: [], nextCursor: null }) });
    });
    await page.route('/api/sources*', async route => {
      // Only intercept GET, let POST through
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      } else {
        await route.continue();
      }
    });
    await page.route('/api/reading-points*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/');

    const status = await page.evaluate(async () => {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', url: 'https://example.com/feed', tags: ['Games'] }),
      });
      return res.status;
    });

    expect(status).toBe(401);
  });
});

test.describe('Admin page UI', () => {
  // The /admin page has not been implemented yet (app/admin/ is empty).
  // These tests document the expected behaviour and will be unskipped
  // once the page is built.

  test.skip('shows password input when not authenticated', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test.skip('shows error message on wrong password', async ({ page }) => {
    await page.route('/api/auth/login', async route => {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Wrong password' }) });
    });

    await page.goto('/admin');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/wrong password/i).or(page.getByText(/incorrect/i)).first()).toBeVisible();
  });

  test.skip('shows source list after successful login', async ({ page }) => {
    await page.route('/api/auth/login', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.route('/api/sources', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '1',
            name: 'Rock Paper Shotgun',
            url: 'https://feeds.feedburner.com/RockPaperShotgun',
            custom_tags: ['Games', 'Indie'],
            active: true,
            consecutive_errors: 0,
            last_fetched_at: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.goto('/admin');
    await page.locator('input[type="password"]').fill('testpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText('Rock Paper Shotgun')).toBeVisible();
  });

  test.skip('shows source health dot indicators', async ({ page }) => {
    // Healthy source (consecutive_errors = 0) → green dot
    // Broken source (consecutive_errors >= 3) → red dot
  });

  test.skip('add source form submits name, url, and tags', async ({ page }) => {
    // Requires authenticated session
  });

  test.skip('delete source button triggers DELETE /api/sources/:id', async ({ page }) => {
    // Requires authenticated session
  });
});
