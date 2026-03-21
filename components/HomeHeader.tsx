'use client';

import Link from 'next/link';
import { useState } from 'react';
import ReadingPointsPanel from './ReadingPointsPanel';

type FeedMode = 'foryou' | 'chronological';

interface HomeHeaderProps {
  activeMode: FeedMode;
  onModeChange: (mode: FeedMode) => void;
  currentArticleId?: string | null;
  currentFeedMode?: string;
  currentTag?: string | null;
}

export default function HomeHeader({ activeMode, onModeChange, currentArticleId, currentFeedMode, currentTag }: HomeHeaderProps) {
  const [isReadingPanelOpen, setIsReadingPanelOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-10 bg-[var(--bg-base)]/90 backdrop-blur-sm border-b border-[var(--border)]">
        <div className="max-w-[720px] mx-auto px-4 h-10 flex items-center gap-3">
          {/* Logo — tap to scroll to top */}
          <h1 className="text-sm font-semibold tracking-tight text-[var(--text-primary)] shrink-0">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] rounded-sm"
            >
              AkAna
            </button>
          </h1>

          {/* Tab switcher */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onModeChange('foryou')}
              className={`px-3 h-10 text-xs font-semibold transition-colors duration-150 border-b-2 ${
                activeMode === 'foryou'
                  ? 'text-accent-primary border-accent-primary'
                  : 'text-text-secondary border-transparent hover:text-text-primary'
              }`}
            >
              For You
            </button>
            <button
              type="button"
              onClick={() => onModeChange('chronological')}
              className={`px-3 h-10 text-xs font-semibold transition-colors duration-150 border-b-2 ${
                activeMode === 'chronological'
                  ? 'text-accent-primary border-accent-primary'
                  : 'text-text-secondary border-transparent hover:text-text-primary'
              }`}
            >
              Chronological
            </button>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bookmarks */}
          <Link
            href="/bookmarks"
            aria-label="Bookmarks"
            className="flex items-center justify-center w-8 h-8 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150 rounded-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </Link>

          {/* Search */}
          <Link
            href="/search"
            aria-label="Search articles"
            className="flex items-center justify-center w-8 h-8 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150 rounded-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </Link>

          {/* Reading points */}
          <button
            type="button"
            onClick={() => setIsReadingPanelOpen(true)}
            aria-label="Open reading points"
            className="flex items-center justify-center w-8 h-8 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150 rounded-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </button>
        </div>
      </header>

      <ReadingPointsPanel
        isOpen={isReadingPanelOpen}
        onClose={() => setIsReadingPanelOpen(false)}
        currentArticleId={currentArticleId}
        currentFeedMode={currentFeedMode}
        currentTag={currentTag}
      />
    </>
  );
}
