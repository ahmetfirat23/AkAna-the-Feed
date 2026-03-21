"use client";

import { useState } from "react";

interface BookmarkButtonProps {
  articleId: string;
  isBookmarked: boolean;
  onToggle: (bookmarked: boolean) => void;
  className?: string;
}

export default function BookmarkButton({
  articleId,
  isBookmarked,
  onToggle,
  className = "",
}: BookmarkButtonProps) {
  const [optimistic, setOptimistic] = useState(isBookmarked);
  const [pending, setPending] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const next = !optimistic;
    setOptimistic(next);
    onToggle(next);
    setPending(true);

    try {
      if (next) {
        const res = await fetch("/api/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ article_id: articleId }),
        });
        if (!res.ok) throw new Error("Failed to save bookmark");
      } else {
        const res = await fetch(`/api/bookmarks/${articleId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to remove bookmark");
      }
    } catch {
      // Revert on error
      setOptimistic(!next);
      onToggle(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={optimistic ? "Unsave article" : "Save article"}
      className={`flex items-center justify-center w-11 h-11 text-text-secondary hover:text-accent-primary transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm ${className}`}
    >
      {optimistic ? (
        // Filled bookmark
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="text-accent-primary"
        >
          <path d="M5 3a2 2 0 0 0-2 2v16l9-4 9 4V5a2 2 0 0 0-2-2H5z" />
        </svg>
      ) : (
        // Outline bookmark
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
          <path d="M5 3a2 2 0 0 0-2 2v16l9-4 9 4V5a2 2 0 0 0-2-2H5z" />
        </svg>
      )}
    </button>
  );
}
