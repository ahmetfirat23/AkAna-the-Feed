"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import BookmarkButton from "./BookmarkButton";

export interface Article {
  id: string;
  title: string;
  url: string;
  description: string | null;
  summary: string | null;
  image_url: string | null;
  published_at: string;
  source_name: string;
  source_id?: string;
  tags: string[];
  is_bookmarked: boolean;
}

const LIKED_KEY = "akana_liked";

function getLikedMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LIKED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function setLikedMap(map: Record<string, boolean>) {
  localStorage.setItem(LIKED_KEY, JSON.stringify(map));
}

interface LikeButtonProps {
  articleId: string;
  sourceId?: string;
}

function LikeButton({ articleId, sourceId }: LikeButtonProps) {
  const [liked, setLiked] = useState<boolean>(() => {
    return Boolean(getLikedMap()[articleId]);
  });

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const next = !liked;
    setLiked(next);

    const map = getLikedMap();
    if (next) {
      map[articleId] = true;
    } else {
      delete map[articleId];
    }
    setLikedMap(map);

    if (next) {
      try {
        await fetch("/api/clicks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ article_id: articleId, source_id: sourceId }),
        });
      } catch {
        // Non-fatal — click weight update is best-effort.
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={liked ? "Unlike article" : "Like article"}
      className="flex items-center justify-center w-8 h-8 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm text-text-secondary hover:text-rose-500"
    >
      {liked ? (
        // Filled heart
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="text-rose-500"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ) : (
        // Outline heart
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      )}
    </button>
  );
}

interface ArticleCardProps {
  article: Article;
  onBookmark: (id: string, bookmarked: boolean) => void;
}

/**
 * Format a date string as a concise relative time without a library.
 * Examples: "just now", "4m ago", "2h ago", "3d ago", "1mo ago", "2y ago"
 */
function timeAgo(dateStr: string): string {
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
  if (diffSec < 31536000) return `${Math.floor(diffSec / 2592000)}mo ago`;
  return `${Math.floor(diffSec / 31536000)}y ago`;
}

export default function ArticleCard({ article, onBookmark }: ArticleCardProps) {
  const [bookmarked, setBookmarked] = useState(article.is_bookmarked);

  function handleBookmarkToggle(next: boolean) {
    setBookmarked(next);
    onBookmark(article.id, next);
  }

  const snippet = article.summary ?? article.description;

  return (
    <article className="mb-2 border border-border bg-bg-card hover:bg-bg-surface transition-colors duration-150 md:hover:-translate-y-px md:hover:shadow-md md:transition-[background-color,transform,box-shadow] md:duration-150">
      {/* Article image — full-width above the text block, no inlining */}
      {article.image_url && (
        <Link
          href={`/article/${article.id}`}
          tabIndex={-1}
          aria-hidden="true"
          className="block w-full h-36 relative overflow-hidden bg-bg-surface"
        >
          <Image
            src={article.image_url}
            alt=""
            fill
            sizes="(max-width: 680px) 100vw, 680px"
            className="object-contain"
            unoptimized
          />
        </Link>
      )}

      <div className="px-3 py-2">
        {/* Source + timestamp + tags + external link */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-xs font-medium text-text-secondary">
            {article.source_name}
          </span>
          <span className="text-xs text-text-secondary" aria-hidden="true">
            ·
          </span>
          <time
            dateTime={article.published_at}
            className="text-xs text-text-secondary"
          >
            {timeAgo(article.published_at)}
          </time>
          {article.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="bg-accent-soft text-accent-primary text-xs font-medium px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open original article from ${article.source_name} in new tab`}
            className="ml-1 inline-flex items-center text-text-secondary hover:text-accent-primary transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm"
          >
            <svg
              width="12"
              height="12"
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
          <div className="ml-auto flex items-center gap-0.5 -my-1">
            <LikeButton articleId={article.id} sourceId={article.source_id} />
            <BookmarkButton
              articleId={article.id}
              isBookmarked={bookmarked}
              onToggle={handleBookmarkToggle}
            />
          </div>
        </div>

        {/* Headline — links to in-app reader */}
        <Link
          href={`/article/${article.id}`}
          className="block group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm"
        >
          <h2 className="text-base font-semibold leading-snug text-text-primary group-hover:text-accent-primary transition-colors duration-150 mb-1">
            {article.title}
          </h2>
        </Link>

        {/* Description / summary snippet */}
        {snippet && (
          <p className="text-sm leading-relaxed text-text-secondary line-clamp-3 mb-3">
            {snippet}
          </p>
        )}

      </div>
    </article>
  );
}
