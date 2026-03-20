'use client';

// DB-synced reading points with localStorage write-through cache.
// Points: 3 auto (is_auto: true) + 5 manual (is_auto: false).
// Auto saves triggered by FeedScroller when user scrolls past threshold.

import { useCallback, useEffect, useState } from 'react';

export interface ReadingPoint {
  id: string;
  label: string | null;
  article_id: string | null;
  article_title: string | null;
  feed_mode: string | null;
  tag_filter: string | null;
  is_auto: boolean;
  created_at: string;
}

const STORAGE_KEY = 'akana_reading_points';

function readCache(): ReadingPoint[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ReadingPoint[];
  } catch {
    return [];
  }
}

function writeCache(points: ReadingPoint[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
  } catch {
    // storage full — ignore
  }
}

// Normalize a raw DB row to the ReadingPoint shape.
// The DB uses `type`, `saved_at`, `article_title`; we map them here.
function normalize(row: Record<string, unknown>): ReadingPoint {
  return {
    id: String(row.id ?? ''),
    label: (row.label as string | null) ?? null,
    article_id: (row.article_id as string | null) ?? null,
    article_title: (row.article_title as string | null) ?? null,
    feed_mode: (row.feed_mode as string | null) ?? null,
    tag_filter: (row.tag_filter as string | null) ?? null,
    is_auto: row.type === 'auto' || row.is_auto === true,
    created_at: String(row.saved_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export function useReadingPoints() {
  const [points, setPoints] = useState<ReadingPoint[]>(() => readCache());
  const [isLoading, setIsLoading] = useState(true);

  // Fetch from DB on mount; DB is source of truth.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/reading-points');
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>[];
        if (cancelled) return;
        const normalized = data.map(normalize);
        setPoints(normalized);
        writeCache(normalized);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const savePoint = useCallback(
    async (
      label: string,
      articleId: string,
      feedMode: string,
      tagFilter: string | null,
      isAuto: boolean,
    ): Promise<void> => {
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticPoint: ReadingPoint = {
        id: optimisticId,
        label,
        article_id: articleId,
        article_title: null,
        feed_mode: feedMode,
        tag_filter: tagFilter,
        is_auto: isAuto,
        created_at: new Date().toISOString(),
      };

      // Optimistic: prepend point and enforce limits locally.
      setPoints((prev) => {
        const limit = isAuto ? 3 : 5;
        const sameType = prev.filter((p) => p.is_auto === isAuto);
        let next = [optimisticPoint, ...prev];
        if (sameType.length >= limit) {
          // Drop the oldest of this type
          const sorted = [...sameType].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
          const oldestId = sorted[0]?.id;
          next = next.filter((p) => p.id !== oldestId);
        }
        writeCache(next);
        return next;
      });

      try {
        const res = await fetch('/api/reading-points', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            article_id: articleId,
            label,
            feed_mode: feedMode,
            tag_filter: tagFilter,
            is_auto: isAuto,
          }),
        });

        if (!res.ok) throw new Error('Failed to save reading point');

        const created = (await res.json()) as Record<string, unknown>;
        const real = normalize(created);

        // Replace optimistic entry with the real one from DB.
        setPoints((prev) => {
          const next = prev.map((p) => (p.id === optimisticId ? real : p));
          writeCache(next);
          return next;
        });
      } catch {
        // Revert optimistic entry on error.
        setPoints((prev) => {
          const next = prev.filter((p) => p.id !== optimisticId);
          writeCache(next);
          return next;
        });
      }
    },
    [],
  );

  const deletePoint = useCallback(async (id: string): Promise<void> => {
    // Optimistic removal.
    setPoints((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writeCache(next);
      return next;
    });

    try {
      const res = await fetch(`/api/reading-points/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete reading point');
    } catch {
      // Revert: re-fetch from DB to restore accurate state.
      const res = await fetch('/api/reading-points');
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>[];
        const normalized = data.map(normalize);
        setPoints(normalized);
        writeCache(normalized);
      }
    }
  }, []);

  return { points, savePoint, deletePoint, isLoading };
}
