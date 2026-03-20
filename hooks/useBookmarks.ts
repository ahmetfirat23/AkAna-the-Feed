'use client';

import { useCallback, useEffect, useState } from 'react';

interface BookmarkRow {
  article_id: string;
}

export function useBookmarks() {
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  // Fetch initial bookmark state on mount.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/bookmarks');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as BookmarkRow[];
        if (!cancelled) {
          setBookmarkedIds(new Set(data.map((b) => b.article_id)));
        }
      } catch {
        // Non-fatal — proceed with empty set.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async (articleId: string): Promise<void> => {
    const wasBookmarked = bookmarkedIds.has(articleId);

    // Optimistic toggle.
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (wasBookmarked) {
        next.delete(articleId);
      } else {
        next.add(articleId);
      }
      return next;
    });

    try {
      if (wasBookmarked) {
        const res = await fetch(`/api/bookmarks/${articleId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to remove bookmark');
      } else {
        const res = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article_id: articleId }),
        });
        if (!res.ok) throw new Error('Failed to save bookmark');
      }
    } catch {
      // Revert optimistic change on error.
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (wasBookmarked) {
          next.add(articleId);
        } else {
          next.delete(articleId);
        }
        return next;
      });
    }
  }, [bookmarkedIds]);

  return { bookmarkedIds, toggle };
}
