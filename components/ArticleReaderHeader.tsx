'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import BookmarkButton from '@/components/BookmarkButton';

interface ArticleReaderHeaderProps {
  articleId: string;
  sourceId: string;
  articleUrl: string;
  articleTitle: string;
}

export function ArticleReaderHeader({
  articleId,
  sourceId,
  articleUrl,
  articleTitle,
}: ArticleReaderHeaderProps) {
  const router = useRouter();
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Record click event on mount (fire and forget)
  useEffect(() => {
    fetch('/api/clicks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: articleId, source_id: sourceId }),
    }).catch(() => {});
  }, [articleId, sourceId]);

  // Fetch initial bookmark state
  useEffect(() => {
    let cancelled = false;

    fetch('/api/bookmarks')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Array<{ article_id: string }>) => {
        if (!cancelled) {
          setIsBookmarked(data.some((b) => b.article_id === articleId));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  function handleBack() {
    // If there's browser history, go back; otherwise go home
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }

  return (
    <header
      className="sticky top-0 z-10 flex items-center gap-2 px-2 py-2 border-b shadow-sm"
      style={{
        backgroundColor: 'var(--reader-bg)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        aria-label="Back"
        className="flex items-center justify-center w-11 h-11 transition-colors duration-150 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* Title — truncated, fills remaining space */}
      <p
        className="flex-1 text-sm font-semibold truncate"
        style={{ color: 'var(--reader-text)' }}
      >
        {articleTitle}
      </p>

      {/* Open original */}
      <a
        href={articleUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open original article"
        className="flex items-center justify-center w-11 h-11 transition-colors duration-150 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>

      {/* Bookmark toggle */}
      <BookmarkButton
        articleId={articleId}
        isBookmarked={isBookmarked}
        onToggle={setIsBookmarked}
      />
    </header>
  );
}
