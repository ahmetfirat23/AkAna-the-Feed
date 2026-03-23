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

import { useCallback } from 'react';

const STORAGE_KEY = 'akana_seen';
const MAX_SEEN_ENTRIES = 500;

// Dynamic hide thresholds based on user_interest_score:
//   > 0.6  → hide after 3 other sessions (high-value, keep re-showing)
//   > 0.2  → hide after 2 other sessions (default)
//   ≤ 0.2  → hide after 1 other session  (low-value, discard fast)
function hideThreshold(userInterestScore?: number): number {
  if (userInterestScore === undefined) return 1;
  if (userInterestScore > 0.6) return 2; // other-session count: 3 sessions total = 2 others
  if (userInterestScore > 0.2) return 1; // 2 sessions total = 1 other (previous default)
  return 0; // hide after the first session it was seen in (1 session = 0 others needed)
}

// SeenMap: articleId → array of sessionIds (stored as array; Set semantics enforced in code)
type SeenMap = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Module-level page-load session ID — changes on every page load/reload.
// Using a module variable (not sessionStorage) means each reload = new session,
// so articles seen in a previous visit are hidden in For You on the next load.
// ---------------------------------------------------------------------------

let _pageLoadSessionId: string | null = null;
function getPageLoadSessionId(): string {
  if (_pageLoadSessionId === null) {
    _pageLoadSessionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  return _pageLoadSessionId;
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

  /**
   * Mark a list of article IDs as seen in the current session.
   * Mutates localStorage in place; trims if over MAX_SEEN_ENTRIES.
   */
  const markSeen = useCallback((articleIds: string[]): void => {
    if (articleIds.length === 0) return;
    const sid = getPageLoadSessionId();
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
   * Returns true if the article has been seen in enough other sessions to be hidden.
   * The threshold scales with user_interest_score:
   *   > 0.6  → kept for 3 sessions (shown more because it's highly relevant)
   *   > 0.2  → kept for 2 sessions (default behaviour)
   *   ≤ 0.2  → hidden after 1 session (low-interest, cleared fast)
   * The current session's own views never cause hiding.
   */
  const isHidden = useCallback((articleId: string, userInterestScore?: number): boolean => {
    const sid = getPageLoadSessionId();
    const map = loadSeenMap();
    const sessions = map[articleId];
    if (!sessions || sessions.length === 0) return false;

    const threshold = hideThreshold(userInterestScore);

    let otherCount = 0;
    for (const s of sessions) {
      if (s !== sid) {
        otherCount += 1;
        if (otherCount > threshold) return true;
      }
    }
    return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { markSeen, isHidden };
}
