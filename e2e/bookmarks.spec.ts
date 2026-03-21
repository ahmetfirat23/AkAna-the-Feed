import { test, expect } from '@playwright/test';

// Bookmarks page (/bookmarks) — "use client" component, fetches /api/bookmarks
// on mount and renders BookmarkRow → ArticleCard list.

// Full BookmarkRow shape as returned by the real API (JOIN with articles + sources)
function makeMockBookmarkRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'bm-1',
    created_at: new Date().toISOString(),
    article_id: 'art-1',
    articles: {
      id: 'art-1',
      title: 'My Saved Article',
      description: 'A saved article description.',
      summary: 'A concise summary.',
      link: 'https://example.com/my-saved-article',
      published_at: new Date().toISOString(),
      image_url: null,
      sources: {
        name: 'Rock Paper Shotgun',
        custom_tags: ['Games', 'Indie'],
      },
    },
    ...overrides,
  };
}

test.describe('Bookmarks page', () => {
  test('shows "No bookmarks yet" empty state when API returns empty array', async ({ page }) => {
    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    const bookmarksDone = page.waitForResponse(/\/api\/bookmarks/);
    await page.goto('/bookmarks');
    await bookmarksDone;

    await expect(
      page.getByText('No bookmarks yet. Tap the bookmark icon on any article to save it.'),
    ).toBeVisible();
  });

  test('shows loading state briefly before articles render', async ({ page }) => {
    // Slow the response to catch the loading state
    await page.route(/\/api\/bookmarks/, async route => {
      await new Promise(resolve => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/bookmarks');
    // Loading… is shown while the fetch is in flight
    await expect(page.getByText('Loading…')).toBeVisible();
  });

  test('shows error message when API returns non-200', async ({ page }) => {
    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    const bookmarksDone = page.waitForResponse(/\/api\/bookmarks/);
    await page.goto('/bookmarks');
    await bookmarksDone;
    await expect(page.getByText(/server error 500/i)).toBeVisible();
  });

  test('renders bookmarked article title when bookmarks exist', async ({ page }) => {
    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([makeMockBookmarkRow()]),
      });
    });

    const bookmarksDone = page.waitForResponse(/\/api\/bookmarks/);
    await page.goto('/bookmarks');
    await bookmarksDone;
    await expect(page.getByRole('heading', { name: 'My Saved Article' })).toBeVisible();
  });

  test('renders source name for bookmarked article', async ({ page }) => {
    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([makeMockBookmarkRow()]),
      });
    });

    const bookmarksDone = page.waitForResponse(/\/api\/bookmarks/);
    await page.goto('/bookmarks');
    await bookmarksDone;
    await expect(page.getByText('Rock Paper Shotgun')).toBeVisible();
  });

  test('renders the article count badge in the header', async ({ page }) => {
    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([makeMockBookmarkRow()]),
      });
    });

    const bookmarksDone = page.waitForResponse(/\/api\/bookmarks/);
    await page.goto('/bookmarks');
    await bookmarksDone;
    // BookmarksPage shows a count badge: articles.length (scoped to header to avoid Next.js dev overlay)
    await expect(page.getByRole('banner').getByText('1', { exact: true })).toBeVisible();
  });

  test('page header shows "Bookmarks" heading', async ({ page }) => {
    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    const bookmarksDone = page.waitForResponse(/\/api\/bookmarks/);
    await page.goto('/bookmarks');
    await bookmarksDone;
    await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
  });

  test('back button is visible and has correct aria-label', async ({ page }) => {
    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    const bookmarksDone = page.waitForResponse(/\/api\/bookmarks/);
    await page.goto('/bookmarks');
    await bookmarksDone;
    const backButton = page.getByRole('button', { name: 'Go back' });
    await expect(backButton).toBeVisible();
  });

  test('back button navigates to previous page', async ({ page }) => {
    // Set up the feed page first so there is browser history
    await page.route(/\/api\/feed/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ articles: [], nextCursor: null }) });
    });
    await page.route(/\/api\/sources/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(/\/api\/reading-points/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    const feedDone = page.waitForResponse(/\/api\/feed/);
    await page.goto('/');
    await feedDone;
    await page.goto('/bookmarks');

    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page).toHaveURL('/');
  });

  test('article title in bookmark card links to the reader page', async ({ page }) => {
    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([makeMockBookmarkRow()]),
      });
    });
    await page.route('/api/clicks', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    const bookmarksDone = page.waitForResponse(/\/api\/bookmarks/);
    await page.goto('/bookmarks');
    await bookmarksDone;
    // The article title link in ArticleCard points to /article/[id]
    const titleLink = page.getByRole('link', { name: 'My Saved Article' });
    await expect(titleLink).toBeVisible();
    await expect(titleLink).toHaveAttribute('href', '/article/art-1');
  });

  test('bookmark toggle on a bookmarked card removes it from the list', async ({ page }) => {
    await page.route(/\/api\/bookmarks/, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([makeMockBookmarkRow()]),
        });
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        await route.continue();
      }
    });

    const bookmarksDone = page.waitForResponse(/\/api\/bookmarks/);
    await page.goto('/bookmarks');
    await bookmarksDone;
    await expect(page.getByRole('heading', { name: 'My Saved Article' })).toBeVisible();

    // BookmarkButton: toggles bookmark state; unbookmarking removes card from list
    // The BookmarkButton has aria-label "Unsave article" when the article is bookmarked
    const bookmarkBtn = page.getByRole('button', { name: /unsave article/i });
    await bookmarkBtn.click();

    // Article should disappear from the list (optimistic removal in handleBookmark)
    await expect(page.getByRole('heading', { name: 'My Saved Article' })).not.toBeVisible();
  });

  test('renders multiple bookmarked articles', async ({ page }) => {
    const secondRow = makeMockBookmarkRow({
      id: 'bm-2',
      article_id: 'art-2',
      articles: {
        id: 'art-2',
        title: 'Second Saved Article',
        description: null,
        summary: 'Second summary.',
        link: 'https://example.com/second',
        published_at: new Date().toISOString(),
        image_url: null,
        sources: { name: 'Kotaku', custom_tags: ['Games'] },
      },
    });

    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([makeMockBookmarkRow(), secondRow]),
      });
    });

    const bookmarksDone = page.waitForResponse(/\/api\/bookmarks/);
    await page.goto('/bookmarks');
    await bookmarksDone;
    await expect(page.getByRole('heading', { name: 'My Saved Article' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Second Saved Article' })).toBeVisible();
    // Count badge should show 2 (scoped to header to avoid Next.js dev overlay)
    await expect(page.getByRole('banner').getByText('2', { exact: true })).toBeVisible();
  });
});
