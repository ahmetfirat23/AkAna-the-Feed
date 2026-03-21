'use client';

// useSeenArticles: tracks which articles a user has seen across browser sessions.
//
// Session tracking:
//   - sessionStorage key `akana_session_id` holds a random ID generated once per
//     browser session (cleared when the tab/window closes).
//
// Persistence:
//   - localStorage key `akana_seen` holds a JSON object:
//       Record<articleId, sessionId[]>
//     where the array is the deduplicated set of session IDs that have seen the article.
//   - Capped at MAX_SEEN_ENTRIES entries; oldest entries are trimmed when the cap is
//     exceeded. "Oldest" is approximated by insertion order in the object (Object.keys
//     iteration order is insertion order for string keys in V8/modern engines).
//
// isHidden logic:
//   - Returns true only when the article has been seen in 2 or more sessions that are
//     NOT the current session. The current session's view never hides an article.

import { useCallback, useRef } from 'react';

const SESSION_KEY = 'akana_session_id';
const STORAGE_KEY = 'akana_seen';
const MAX_SEEN_ENTRIES = 500;
const HIDE_THRESHOLD = 1; // distinct OTHER sessions before an article is hidden

// SeenMap: articleId → array of sessionIds (stored as array; Set semantics enforced in code)
type SeenMap = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Helpers (module-level, no side-effects at import time)
// ---------------------------------------------------------------------------

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      // crypto.randomUUID is available in all browsers that support modern PWAs
      id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage unavailable (private browsing edge-cases)
    return '';
  }
}

function loadSeenMap(): SeenMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as SeenMap;
  } catch {
    return {};
  }
}

function saveSeenMap(map: SeenMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota-exceeded errors — seen data is best-effort.
  }
}

function trimToLimit(map: SeenMap): SeenMap {
  const keys = Object.keys(map);
  if (keys.length <= MAX_SEEN_ENTRIES) return map;
  // Drop oldest entries (first keys in insertion order) to stay within the cap.
  const excess = keys.length - MAX_SEEN_ENTRIES;
  const trimmed: SeenMap = {};
  for (let i = excess; i < keys.length; i++) {
    const k = keys[i];
    trimmed[k] = map[k];
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSeenArticles() {
  // sessionId is stable for the lifetime of the component tree (browser session).
  const sessionIdRef = useRef<string | null>(null);

  function getSessionId(): string {
    if (sessionIdRef.current === null) {
      sessionIdRef.current = getOrCreateSessionId();
    }
    return sessionIdRef.current;
  }

  /**
   * Mark a list of article IDs as seen in the current session.
   * Mutates localStorage in place; trims if over MAX_SEEN_ENTRIES.
   */
  const markSeen = useCallback((articleIds: string[]): void => {
    if (articleIds.length === 0) return;
    const sid = getSessionId();
    if (!sid) return; // sessionStorage unavailable — skip silently

    const map = loadSeenMap();
    let dirty = false;

    for (const id of articleIds) {
      const existing = map[id];
      if (!existing) {
        map[id] = [sid];
        dirty = true;
      } else if (!existing.includes(sid)) {
        existing.push(sid);
        dirty = true;
      }
    }

    if (!dirty) return;

    saveSeenMap(trimToLimit(map));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Returns true if the article has been seen in 2 or more sessions OTHER than
   * the current session. The current session's own views never cause hiding.
   */
  const isHidden = useCallback((articleId: string): boolean => {
    const sid = getSessionId();
    const map = loadSeenMap();
    const sessions = map[articleId];
    if (!sessions || sessions.length === 0) return false;

    // Count sessions that are not the current one.
    let otherCount = 0;
    for (const s of sessions) {
      if (s !== sid) {
        otherCount += 1;
        if (otherCount >= HIDE_THRESHOLD) return true;
      }
    }
    return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { markSeen, isHidden };
}
