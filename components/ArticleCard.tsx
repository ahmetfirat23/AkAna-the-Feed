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
  tags: string[];
  is_bookmarked: boolean;
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
    <article className="border-b border-border bg-bg-card hover:bg-bg-surface transition-colors duration-150 md:hover:-translate-y-px md:hover:shadow-md md:transition-[background-color,transform,box-shadow] md:duration-150">
      {/* Article image — full-width above the text block, no inlining */}
      {article.image_url && (
        <Link
          href={`/article/${article.id}`}
          tabIndex={-1}
          aria-hidden="true"
          className="block w-full aspect-video relative overflow-hidden"
        >
          <Image
            src={article.image_url}
            alt=""
            fill
            sizes="(max-width: 680px) 100vw, 680px"
            className="object-cover"
            unoptimized
          />
        </Link>
      )}

      <div className="p-4">
        {/* Source + timestamp + external link */}
        <div className="flex items-center gap-1.5 mb-2">
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

        {/* Tags + bookmark */}
        <div className="flex items-center justify-between gap-2 -mb-2">
          <div className="flex flex-wrap gap-1.5">
            {article.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="bg-accent-soft text-accent-primary text-xs font-medium px-2 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>

          <BookmarkButton
            articleId={article.id}
            isBookmarked={bookmarked}
            onToggle={handleBookmarkToggle}
            className="-mr-2"
          />
        </div>
      </div>
    </article>
  );
}
