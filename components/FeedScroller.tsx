'use client';

// FeedScroller: main feed component with infinite scroll, tab switching, topic
// filtering, and auto reading-point saves every 10 articles scrolled past.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const CHRONO_POS_KEY = 'akana_chrono_last';
const FORYOU_POS_KEY = 'akana_foryou_last';
const FEED_CACHE_KEY = 'akana_feed_cache';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface FeedCache {
  mode: string;
  tag: string | null;
  articles: Article[];
  cursor: string | null;
  hasMore: boolean;
  savedAt: number;
}

function loadFeedCache(mode: string, tag: string | null): FeedCache | null {
  try {
    const raw = sessionStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as FeedCache;
    if (c.mode !== mode || c.tag !== tag) return null;
    if (Date.now() - c.savedAt > CACHE_TTL_MS) return null;
    return c;
  } catch { return null; }
}

function saveFeedCache(mode: string, tag: string | null, articles: Article[], cursor: string | null, hasMore: boolean) {
  try {
    const c: FeedCache = { mode, tag, articles, cursor, hasMore, savedAt: Date.now() };
    sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify(c));
  } catch {}
}

import ArticleCard, { type Article } from './ArticleCard';
import TopicFilter from './TopicFilter';
import { useReadingPoints } from '@/hooks/useReadingPoints';
import { useSeenArticles } from '@/hooks/useSeenArticles';

type FeedMode = 'foryou' | 'chronological';

interface FeedScrollerProps {
  activeMode: FeedMode;
  onModeChange: (mode: FeedMode) => void;
  onTagChange?: (tag: string | null) => void;
  onCurrentArticleChange?: (articleId: string | null) => void;
}

interface FeedResponse {
  articles: Article[];
  nextCursor: string | null;
}

export default function FeedScroller({ activeMode, onModeChange: _onModeChange, onTagChange, onCurrentArticleChange }: FeedScrollerProps) {
  const searchParams = useSearchParams();
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
  // Ref-based loading flag so fetchArticles never reads stale closure state.
  const isLoadingRef = useRef(false);
  // AbortController so switching modes cancels any in-flight fetch immediately.
  const abortRef = useRef<AbortController | null>(null);

  const { savePoint } = useReadingPoints();
  const { markSeen, isHidden } = useSeenArticles();

  // Save topmost visible article ID on scroll for both modes.
  // Chronological uses localStorage (persistent across sessions for position restore).
  // For You uses sessionStorage (only needed within the same browser session).
  const posSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveScrollPosition = useCallback(() => {
    const id = findTopmostVisibleArticle(articleRefs.current);
    if (!id) return;
    try {
      if (activeMode === 'chronological') {
        localStorage.setItem(CHRONO_POS_KEY, id);
      } else {
        sessionStorage.setItem(FORYOU_POS_KEY, id);
      }
    } catch {}
  }, [activeMode]);

  useEffect(() => {
    function onScroll() {
      if (posSaveTimerRef.current) clearTimeout(posSaveTimerRef.current);
      posSaveTimerRef.current = setTimeout(saveScrollPosition, 300);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('beforeunload', saveScrollPosition);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('beforeunload', saveScrollPosition);
      saveScrollPosition(); // save immediately on mode switch / unmount
    };
  }, [saveScrollPosition]);

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
  // Uses isLoadingRef (not state) so mode switches never read stale values.
  const fetchArticles = useCallback(
    async (mode: FeedMode, tag: string | null, nextCursor: string | null, signal?: AbortSignal) => {
      // For infinite scroll: skip if already loading. For mode/tag resets the
      // caller aborts the previous request and passes a fresh signal instead.
      if (!signal && isLoadingRef.current) return;

      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ mode });
        if (tag) params.set('tag', tag);
        if (nextCursor) params.set('cursor', nextCursor);

        const res = await fetch(`/api/feed?${params}`, { signal });
        if (!res.ok) throw new Error('Could not load feed — check your connection.');

        const data: FeedResponse = await res.json();

        setArticles((prev) => {
          if (!nextCursor) return data.articles;
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...data.articles.filter((a) => !seen.has(a.id))];
        });

        // Note: markSeen is called per-article when it enters the viewport (onVisible),
        // not here — so only articles the user actually scrolls past count as seen.

        setCursor(data.nextCursor);
        setHasMore(data.nextCursor !== null);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Could not load feed.');
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [markSeen],
  );

  // After articles are restored from cache (back-navigation), scroll to where the
  // user was. Both modes use article-ID scroll so it works regardless of image load
  // timing or exact pixel layout.
  const posRestoredRef = useRef(false);
  useEffect(() => {
    if (posRestoredRef.current || articles.length === 0) return;
    let savedId: string | null = null;
    try {
      savedId = activeMode === 'chronological'
        ? localStorage.getItem(CHRONO_POS_KEY)
        : sessionStorage.getItem(FORYOU_POS_KEY);
    } catch {}
    if (!savedId) return;
    const el = articleRefs.current.get(savedId);
    if (el) {
      posRestoredRef.current = true;
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [activeMode, articles]);

  // Handle scrollTo param from reading points navigation.
  // Track the last scrollTo we processed so clicking the same point twice still works.
  const lastScrollToRef = useRef<string | null>(null);
  useEffect(() => {
    const scrollTo = searchParams.get('scrollTo');
    if (!scrollTo || articles.length === 0) return;
    if (scrollTo === lastScrollToRef.current) return;
    const el = articleRefs.current.get(scrollTo);
    if (el) {
      lastScrollToRef.current = scrollTo;
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [articles, searchParams]);

  // Report topmost visible article to parent for reading point saving.
  useEffect(() => {
    if (!onCurrentArticleChange || articles.length === 0) return;
    onCurrentArticleChange(findTopmostVisibleArticle(articleRefs.current));
  }, [articles, onCurrentArticleChange]);

  useEffect(() => {
    if (!onCurrentArticleChange) return;
    function onScroll() {
      onCurrentArticleChange?.(findTopmostVisibleArticle(articleRefs.current));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onCurrentArticleChange]);

  // Save feed state to sessionStorage whenever articles change (for back-nav restore).
  useEffect(() => {
    if (articles.length === 0) return;
    saveFeedCache(activeMode, activeTag, articles, cursor, hasMore);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles]);


  // Reset and reload when mode or tag changes.
  // Abort any in-flight fetch so switching modes is always instant.
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Try to restore from cache (back-navigation).
    const cache = loadFeedCache(activeMode, activeTag);
    if (cache && cache.articles.length > 0) {
      setArticles(cache.articles);
      setCursor(cache.cursor);
      setHasMore(cache.hasMore);
      isLoadingRef.current = false;
      scrolledPastCount.current = 0;
      lastAutoSaveCount.current = 0;
      posRestoredRef.current = false;
      return;
    }

    setArticles([]);
    setCursor(null);
    setHasMore(true);
    isLoadingRef.current = false;
    scrolledPastCount.current = 0;
    lastAutoSaveCount.current = 0;
    posRestoredRef.current = false;
    fetchArticles(activeMode, activeTag, null, controller.signal);
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

  function handleTagChange(tag: string | null) {
    setActiveTag(tag);
    onTagChange?.(tag);
  }

  function handleBookmark(_id: string, _bookmarked: boolean) {
    // BookmarkButton manages its own state; no action needed here.
  }

  // In For You mode, hide articles the user has already seen in 2+ other sessions.
  // Chronological mode shows everything as-is.
  const visibleArticles =
    activeMode === 'foryou' ? articles.filter((a) => !isHidden(a.id, a.user_interest_score)) : articles;

  return (
    <div className="w-full max-w-[720px] mx-auto">
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
        {visibleArticles.map((article) => (
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
              onVisible={(id) => markSeen([id])}
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
