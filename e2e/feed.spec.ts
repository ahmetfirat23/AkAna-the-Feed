import { test, expect } from '@playwright/test';

// Mock article matching the actual Article interface from ArticleCard.tsx
const mockArticle = {
  id: '1',
  title: 'Test Article About Games',
  url: 'https://example.com/article-1',
  description: 'A test article about gaming news.',
  summary: 'A short summary of the gaming article.',
  image_url: null,
  published_at: new Date().toISOString(),
  source_name: 'Rock Paper Shotgun',
  tags: ['Games'],
  is_bookmarked: false,
};

// FeedScroller fetches /api/sources to populate TopicFilter chips.
// It expects { custom_tags: string[] }[] shape.
const mockSources = [
  { id: '1', name: 'Rock Paper Shotgun', url: 'https://feeds.feedburner.com/RockPaperShotgun', custom_tags: ['Games', 'Indie'], active: true, consecutive_errors: 0, last_fetched_at: new Date().toISOString() },
];

test.describe('Main feed page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock /api/feed — matches the FeedResponse shape used in FeedScroller
    await page.route(/\/api\/feed/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          articles: [mockArticle],
          nextCursor: null,
        }),
      });
    });

    // Mock /api/sources — FeedScroller reads custom_tags to build TopicFilter chips
    await page.route(/\/api\/sources/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSources),
      });
    });

    // Mock /api/reading-points — useReadingPoints hook fetches on mount
    await page.route(/\/api\/reading-points/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('renders the app name in the header', async ({ page }) => {
    await page.goto('/');
    // HomeHeader renders <h1>AkAna</h1>
    await expect(page.getByRole('heading', { name: 'AkAna' })).toBeVisible();
  });

  test('shows For You and Chronological tab buttons', async ({ page }) => {
    await page.goto('/');
    // FeedScroller renders two <button> tabs
    await expect(page.getByRole('button', { name: 'For You' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chronological' })).toBeVisible();
  });

  test('displays articles returned by the feed API', async ({ page }) => {
    const feedDone = page.waitForResponse(/\/api\/feed/);
    await page.goto('/');
    await feedDone;
    // ArticleCard renders the title as an <h2> inside a Link
    await expect(page.getByRole('heading', { name: 'Test Article About Games' })).toBeVisible();
    // Source name rendered as a <span>
    await expect(page.getByText('Rock Paper Shotgun')).toBeVisible();
  });

  test('displays the article summary / description snippet', async ({ page }) => {
    const feedDone = page.waitForResponse(/\/api\/feed/);
    await page.goto('/');
    await feedDone;
    await expect(page.getByText('A short summary of the gaming article.')).toBeVisible();
  });

  test('topic filter shows All chip plus source tags', async ({ page }) => {
    const feedDone = page.waitForResponse(/\/api\/feed/);
    const sourcesDone = page.waitForResponse(/\/api\/sources/);
    await page.goto('/');
    await feedDone;
    await sourcesDone;
    // TopicFilter always renders an "All" chip first
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    // Tags sourced from mock sources: Games and Indie
    await expect(page.getByRole('button', { name: 'Games' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Indie' })).toBeVisible();
  });

  test('switching to Chronological tab triggers a new feed request with mode=chronological', async ({ page }) => {
    const requests: string[] = [];
    await page.route(/\/api\/feed/, async route => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [mockArticle], nextCursor: null }),
      });
    });

    const initialFeedDone = page.waitForResponse(/\/api\/feed/);
    await page.goto('/');
    await initialFeedDone;

    const chronoResponsePromise = page.waitForResponse(res => res.url().includes('mode=chronological'));
    await page.getByRole('button', { name: 'Chronological' }).click();
    await chronoResponsePromise;
    const chronoRequests = requests.filter(url => url.includes('mode=chronological'));
    expect(chronoRequests.length).toBeGreaterThan(0);
  });

  test('switching back to For You tab triggers feed request with mode=foryou', async ({ page }) => {
    const initialFeedDone = page.waitForResponse(/\/api\/feed/);
    await page.goto('/');
    await initialFeedDone;

    const chronoResponsePromise = page.waitForResponse(res => res.url().includes('mode=chronological'));
    await page.getByRole('button', { name: 'Chronological' }).click();
    await chronoResponsePromise;

    const foryouResponsePromise = page.waitForResponse(res => res.url().includes('mode=foryou'));
    await page.getByRole('button', { name: 'For You' }).click();
    await foryouResponsePromise;
  });

  test('clicking a tag chip adds tag filter to feed request', async ({ page }) => {
    const feedDone = page.waitForResponse(/\/api\/feed/);
    const sourcesDone = page.waitForResponse(/\/api\/sources/);
    await page.goto('/');
    await feedDone;
    await sourcesDone;
    await expect(page.getByRole('button', { name: 'Games' })).toBeVisible();
    const tagResponsePromise = page.waitForResponse(res => res.url().includes('tag=Games'));
    await page.getByRole('button', { name: 'Games' }).click();
    await tagResponsePromise;
  });

  test('clicking All chip clears the active tag filter', async ({ page }) => {
    const feedDone = page.waitForResponse(/\/api\/feed/);
    const sourcesDone = page.waitForResponse(/\/api\/sources/);
    await page.goto('/');
    await feedDone;
    await sourcesDone;
    await expect(page.getByRole('button', { name: 'Games' })).toBeVisible();
    // Select Games first
    const tagResponsePromise = page.waitForResponse(res => res.url().includes('tag=Games'));
    await page.getByRole('button', { name: 'Games' }).click();
    await tagResponsePromise;
    // Then click All to clear the filter
    const allResponsePromise = page.waitForResponse(res => res.url().includes('/api/feed') && !res.url().includes('tag='));
    await page.getByRole('button', { name: 'All' }).click();
    await allResponsePromise;
  });

  test('article title links to the in-app reader page', async ({ page }) => {
    // Mock reader API and clicks API so the reader page can load
    await page.route(/\/api\/reader\//, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: '<p>Full article text.</p>',
          title: 'Test Article About Games',
          byline: null,
        }),
      });
    });
    await page.route('/api/clicks', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.route(/\/api\/bookmarks/, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    const feedDone = page.waitForResponse(/\/api\/feed/);
    await page.goto('/');
    await feedDone;
    await expect(page.getByRole('heading', { name: 'Test Article About Games' })).toBeVisible();
    await page.getByRole('heading', { name: 'Test Article About Games' }).click();
    await expect(page).toHaveURL(/\/article\/1/);
  });

  test('header has a link to the search page', async ({ page }) => {
    await page.goto('/');
    // HomeHeader renders a Link with aria-label="Search articles" pointing to /search
    const searchLink = page.getByRole('link', { name: 'Search articles' });
    await expect(searchLink).toBeVisible();
    await expect(searchLink).toHaveAttribute('href', '/search');
  });

  test('reading points button is visible in the header', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open reading points' })).toBeVisible();
  });

  test('empty feed state shown when API returns no articles', async ({ page }) => {
    await page.route(/\/api\/feed/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [], nextCursor: null }),
      });
    });

    const feedDone = page.waitForResponse(/\/api\/feed/);
    await page.goto('/');
    await feedDone;
    await expect(page.getByText('No articles yet — add a feed in admin.')).toBeVisible();
  });

  test('error state shown when feed API returns a non-200', async ({ page }) => {
    await page.route(/\/api\/feed/, async route => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal server error' }) });
    });

    const feedDone = page.waitForResponse(/\/api\/feed/);
    await page.goto('/');
    await feedDone;
    await expect(page.getByText('Could not load feed — check your connection.')).toBeVisible();
  });

  test('end of feed message appears when nextCursor is null and articles are present', async ({ page }) => {
    const feedDone = page.waitForResponse(/\/api\/feed/);
    await page.goto('/');
    await feedDone;
    // With nextCursor: null and articles present, FeedScroller shows "End of feed"
    await expect(page.getByText('End of feed')).toBeVisible();
  });
});
