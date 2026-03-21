'use client';

import { Suspense, useState } from 'react';
import FeedScroller from './FeedScroller';
import HomeHeader from './HomeHeader';

type FeedMode = 'foryou' | 'chronological';
const FEED_MODE_KEY = 'akana_feed_mode';

export default function FeedPage() {
  const [activeMode, setActiveMode] = useState<FeedMode>(() => {
    if (typeof window === 'undefined') return 'foryou';
    return (localStorage.getItem(FEED_MODE_KEY) as FeedMode) ?? 'foryou';
  });
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [currentArticleId, setCurrentArticleId] = useState<string | null>(null);

  function handleModeChange(mode: FeedMode) {
    setActiveMode(mode);
    try { localStorage.setItem(FEED_MODE_KEY, mode); } catch {}
  }

  return (
    <>
      <HomeHeader
        activeMode={activeMode}
        onModeChange={handleModeChange}
        currentArticleId={currentArticleId}
        currentFeedMode={activeMode}
        currentTag={activeTag}
      />
      <Suspense>
        <FeedScroller
          activeMode={activeMode}
          onModeChange={handleModeChange}
          onTagChange={setActiveTag}
          onCurrentArticleChange={setCurrentArticleId}
        />
      </Suspense>
    </>
  );
}
