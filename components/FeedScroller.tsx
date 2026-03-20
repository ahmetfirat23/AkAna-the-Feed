'use client';

// FeedScroller: main feed component with infinite scroll, tab switching, topic
// filtering, and auto reading-point saves every 10 articles scrolled past.

import { useCallback, useEffect, useRef, useState } from 'react';
import ArticleCard, { type Article } from './ArticleCard';
import TopicFilter from './TopicFilter';
import { useReadingPoints } from '@/hooks/useReadingPoints';

type FeedMode = 'foryou' | 'chronological';

interface FeedScrollerProps {
  initialMode?: FeedMode;
}

interface FeedResponse {
  articles: Article[];
  nextCursor: string | null;
}

const FEED_MODE_KEY = 'akana_feed_mode';

export default function FeedScroller({ initialMode = 'foryou' }: FeedScrollerProps) {
  // Persist active mode in localStorage.
  const [activeMode, setActiveMode] = useState<FeedMode>(() => {
    if (typeof window === 'undefined') return initialMode;
    return (localStorage.getItem(FEED_MODE_KEY) as FeedMode) ?? initialMode;
  });
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const [articles, setArticles] = useState<Article[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track how many articles the user has scrolled past for auto-save trigger.
  const scrolledPastCount = useRef(0);
  const lastAutoSaveCount = useRef(0);
  const articleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { savePoint } = useReadingPoints();

  // Fetch available tags from sources (for TopicFilter).
  useEffect(() => {
    async function loadTags() {
      try {
        const res = await fetch('/api/sources');
        if (!res.ok) return;
        const sources = (await res.json()) as { custom_tags: string[] }[];
        const tagSet = new Set<string>();
        for (const s of sources) {
          for (const t of s.custom_tags ?? []) {
            tagSet.add(t);
          }
        }
        setAvailableTags(Array.from(tagSet).sort());
      } catch {
        // Non-fatal — filter just won't show tags.
      }
    }
    loadTags();
  }, []);

  // Core fetch function. Appends to existing articles if cursor is set.
  const fetchArticles = useCallback(
    async (mode: FeedMode, tag: string | null, nextCursor: string | null) => {
      if (isLoading) return;
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ mode });
        if (tag) params.set('tag', tag);
        if (nextCursor) params.set('cursor', nextCursor);

        const res = await fetch(`/api/feed?${params}`);
        if (!res.ok) throw new Error('Could not load feed — check your connection.');

        const data: FeedResponse = await res.json();

        setArticles((prev) =>
          nextCursor ? [...prev, ...data.articles] : data.articles,
        );
        setCursor(data.nextCursor);
        setHasMore(data.nextCursor !== null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load feed.');
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  // Reset and reload when mode or tag changes.
  useEffect(() => {
    setArticles([]);
    setCursor(null);
    setHasMore(true);
    scrolledPastCount.current = 0;
    lastAutoSaveCount.current = 0;
    fetchArticles(activeMode, activeTag, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, activeTag]);

  // IntersectionObserver on sentinel to trigger infinite scroll.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading) {
          fetchArticles(activeMode, activeTag, cursor);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, cursor, activeMode, activeTag, fetchArticles]);

  // IntersectionObserver on each article card to track scroll-past count
  // for auto reading-point saves every 10 articles.
  useEffect(() => {
    if (articles.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            // Article has left the viewport from above (scrolled past).
            const rect = entry.boundingClientRect;
            if (rect.bottom < 0) {
              scrolledPastCount.current += 1;
            }
          }
        }

        // Auto-save every 10 articles scrolled past.
        const passed = scrolledPastCount.current;
        if (passed - lastAutoSaveCount.current >= 10) {
          lastAutoSaveCount.current = passed;

          // Find the top-most visible article to save as the point.
          const visibleArticleId = findTopmostVisibleArticle(articleRefs.current);
          if (visibleArticleId) {
            const article = articles.find((a) => a.id === visibleArticleId);
            if (article) {
              const label = `Auto — ${new Date().toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}`;
              savePoint(label, article.id, activeMode, activeTag, true).catch(
                () => void 0,
              );
            }
          }
        }
      },
      { threshold: 0 },
    );

    for (const [, el] of articleRefs.current) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [articles, activeMode, activeTag, savePoint]);

  function handleModeChange(mode: FeedMode) {
    if (mode === activeMode) return;
    localStorage.setItem(FEED_MODE_KEY, mode);
    setActiveMode(mode);
  }

  function handleTagChange(tag: string | null) {
    setActiveTag(tag);
  }

  function handleBookmark(_id: string, _bookmarked: boolean) {
    // BookmarkButton manages its own state; no action needed here.
  }

  return (
    <div className="w-full max-w-[620px] mx-auto">
      {/* Tab switcher */}
      <div className="flex border-b border-border bg-bg-card sticky top-0 z-10">
        <button
          type="button"
          onClick={() => handleModeChange('foryou')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-primary ${
            activeMode === 'foryou'
              ? 'text-accent-primary border-b-2 border-accent-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          For You
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('chronological')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-primary ${
            activeMode === 'chronological'
              ? 'text-accent-primary border-b-2 border-accent-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Chronological
        </button>
      </div>

      {/* Topic filter chips */}
      {availableTags.length > 0 && (
        <TopicFilter
          tags={availableTags}
          activeTag={activeTag}
          onTagChange={handleTagChange}
        />
      )}

      {/* Article list */}
      <div>
        {articles.map((article) => (
          <div
            key={article.id}
            ref={(el) => {
              if (el) {
                articleRefs.current.set(article.id, el);
              } else {
                articleRefs.current.delete(article.id);
              }
            }}
          >
            <ArticleCard
              article={article}
              onBookmark={handleBookmark}
            />
          </div>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <p className="px-4 py-6 text-sm text-text-secondary text-center">{error}</p>
      )}

      {/* Loading state — simple spinner, no shimmer */}
      {isLoading && articles.length === 0 && (
        <div className="flex justify-center py-12" aria-label="Loading feed">
          <span
            className="block w-5 h-5 rounded-full border-2 border-border border-t-accent-primary animate-spin"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Load-more spinner (pagination in progress) */}
      {isLoading && articles.length > 0 && (
        <div className="flex justify-center py-6" aria-label="Loading more articles">
          <span
            className="block w-4 h-4 rounded-full border-2 border-border border-t-accent-primary animate-spin"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && articles.length === 0 && !error && (
        <p className="px-4 py-12 text-sm text-text-secondary text-center">
          No articles yet — add a feed in admin.
        </p>
      )}

      {/* End of feed */}
      {!hasMore && articles.length > 0 && (
        <p className="px-4 py-6 text-xs text-text-secondary text-center">
          End of feed
        </p>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} aria-hidden="true" />
    </div>
  );
}

// Find the ID of the topmost article currently visible in the viewport.
function findTopmostVisibleArticle(refs: Map<string, HTMLDivElement>): string | null {
  let topmost: string | null = null;
  let topmostTop = Infinity;

  for (const [id, el] of refs) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) {
      if (rect.top < topmostTop) {
        topmostTop = rect.top;
        topmost = id;
      }
    }
  }

  return topmost;
}
