"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
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
  user_interest_score?: number;
}

const LIKED_KEY = "akana_liked";
const DISLIKED_KEY = "akana_disliked";

function getMap(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}

function setMap(key: string, map: Record<string, boolean>) {
  localStorage.setItem(key, JSON.stringify(map));
}

interface ReactionButtonsProps {
  articleId: string;
  sourceId?: string;
}

function ReactionButtons({ articleId, sourceId }: ReactionButtonsProps) {
  const [reaction, setReaction] = useState<"like" | "dislike" | null>(() => {
    if (getMap(LIKED_KEY)[articleId]) return "like";
    if (getMap(DISLIKED_KEY)[articleId]) return "dislike";
    return null;
  });

  async function handleReaction(type: "like" | "dislike", e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const next = reaction === type ? null : type;
    setReaction(next);

    const likedMap = getMap(LIKED_KEY);
    const dislikedMap = getMap(DISLIKED_KEY);

    if (next === "like") {
      likedMap[articleId] = true;
      delete dislikedMap[articleId];
    } else if (next === "dislike") {
      dislikedMap[articleId] = true;
      delete likedMap[articleId];
    } else {
      delete likedMap[articleId];
      delete dislikedMap[articleId];
    }

    setMap(LIKED_KEY, likedMap);
    setMap(DISLIKED_KEY, dislikedMap);

    if (next !== null) {
      try {
        await fetch("/api/clicks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ article_id: articleId, source_id: sourceId, type: next }),
        });
      } catch {
        // Non-fatal
      }
    }
  }

  return (
    <>
      {/* Like */}
      <button
        type="button"
        onClick={(e) => handleReaction("like", e)}
        aria-label={reaction === "like" ? "Unlike article" : "Like article"}
        className="flex items-center justify-center w-8 h-8 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm text-text-secondary hover:text-rose-500"
      >
        {reaction === "like" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-rose-500">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        )}
      </button>

      {/* Dislike */}
      <button
        type="button"
        onClick={(e) => handleReaction("dislike", e)}
        aria-label={reaction === "dislike" ? "Remove dislike" : "Dislike article"}
        className="flex items-center justify-center w-8 h-8 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm text-text-secondary hover:text-text-primary"
      >
        {reaction === "dislike" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
          </svg>
        )}
      </button>
    </>
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

const VIEWED_KEY = "akana_viewed";
const OPENED_KEY = "akana_opened";

function getTrackMap(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { return {}; }
}

export default function ArticleCard({ article, onBookmark }: ArticleCardProps) {
  const [bookmarked, setBookmarked] = useState(article.is_bookmarked);
  const articleRef = useRef<HTMLElement>(null);

  // View tracking — fires once when card scrolls into view (50% visible)
  useEffect(() => {
    const el = articleRef.current;
    if (!el || !article.source_id) return;

    const viewed = getTrackMap(VIEWED_KEY);
    if (viewed[article.id]) return; // already counted

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          const map = getTrackMap(VIEWED_KEY);
          map[article.id] = true;
          localStorage.setItem(VIEWED_KEY, JSON.stringify(map));
          fetch("/api/views", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ article_id: article.id, source_id: article.source_id }),
          }).catch(() => {});
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [article.id, article.source_id]);

  // Open tracking — fires once when user navigates into the article reader
  function handleOpen() {
    if (!article.source_id) return;
    const map = getTrackMap(OPENED_KEY);
    if (map[article.id]) return; // already counted
    map[article.id] = true;
    localStorage.setItem(OPENED_KEY, JSON.stringify(map));
    fetch("/api/opens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article_id: article.id, source_id: article.source_id }),
    }).catch(() => {});
  }

  function handleBookmarkToggle(next: boolean) {
    setBookmarked(next);
    onBookmark(article.id, next);
  }

  const snippet = article.summary ?? article.description;

  return (
    <article ref={articleRef} className="mb-2 border border-border bg-bg-card hover:bg-bg-surface transition-colors duration-150 md:hover:-translate-y-px md:hover:shadow-md md:transition-[background-color,transform,box-shadow] md:duration-150">
      {/* Article image — full-width above the text block, tags overlaid top-left */}
      {article.image_url && (
        <div className="relative w-full h-36 bg-bg-surface overflow-hidden">
          <Link
            href={`/article/${article.id}`}
            tabIndex={-1}
            aria-hidden="true"
            className="block w-full h-full"
            onClick={handleOpen}
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
          {article.tags.length > 0 && (
            <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
              {article.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="bg-accent-soft text-accent-primary text-xs font-medium px-2 py-0.5 rounded-full w-fit"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-3 py-2">
        {/* Single row: source+time on left (truncated), buttons on right (fixed) */}
        <div className="flex items-center gap-1.5 mb-2">
          {/* Left: source · time + external link — shrinks and truncates */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            <span className="text-xs font-medium text-text-secondary truncate shrink-0 max-w-[120px]">
              {article.source_name}
            </span>
            <span className="text-xs text-text-secondary shrink-0" aria-hidden="true">·</span>
            <time dateTime={article.published_at} className="text-xs text-text-secondary shrink-0 whitespace-nowrap">
              {timeAgo(article.published_at)}
            </time>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open original article from ${article.source_name} in new tab`}
              className="shrink-0 inline-flex items-center text-text-secondary hover:text-accent-primary transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>

          {/* Right: reaction + bookmark buttons — never shrinks */}
          <div className="flex items-center gap-0.5 shrink-0 -my-1">
            <ReactionButtons articleId={article.id} sourceId={article.source_id} />
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
          onClick={handleOpen}
        >
          <h2 className="text-base font-semibold leading-snug text-text-primary group-hover:text-accent-primary transition-colors duration-150 mb-1">
            {article.title}
          </h2>
        </Link>

        {/* Description / summary snippet */}
        {snippet && (
          <p className="text-sm leading-relaxed text-text-secondary line-clamp-3">
            {snippet}
          </p>
        )}

      </div>
    </article>
  );
}
