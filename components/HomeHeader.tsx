'use client';

// HomeHeader: sticky app header with search link and reading points toggle.
// Extracted as a client component so useState can manage the panel.

import Link from 'next/link';
import { useState } from 'react';
import ReadingPointsPanel from './ReadingPointsPanel';

export default function HomeHeader() {
  const [isReadingPanelOpen, setIsReadingPanelOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-10 bg-[var(--bg-base)]/90 backdrop-blur-sm border-b border-[var(--border)]">
        <div className="max-w-[680px] mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            AkAna
          </h1>

          <div className="flex items-center gap-1">
            {/* Search */}
            <Link
              href="/search"
              aria-label="Search articles"
              className="flex items-center justify-center w-11 h-11 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] rounded-sm"
            >
              {/* Search icon */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </Link>

            {/* Reading points */}
            <button
              type="button"
              onClick={() => setIsReadingPanelOpen(true)}
              aria-label="Open reading points"
              className="flex items-center justify-center w-11 h-11 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] rounded-sm"
            >
              {/* Bookmark/points icon */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <ReadingPointsPanel
        isOpen={isReadingPanelOpen}
        onClose={() => setIsReadingPanelOpen(false)}
      />
    </>
  );
}
