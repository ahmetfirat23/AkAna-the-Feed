"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ArticleCard, { Article } from "@/components/ArticleCard";

interface BookmarkRow {
  id: string;
  created_at: string;
  article_id: string;
  articles: {
    id: string;
    title: string;
    description: string | null;
    summary: string | null;
    link: string;
    published_at: string;
    image_url: string | null;
    sources: {
      name: string;
      custom_tags: string[];
    } | null;
  } | null;
}

function toArticle(row: BookmarkRow): Article | null {
  if (!row.articles) return null;
  const a = row.articles;
  return {
    id: a.id,
    title: a.title,
    url: a.link,
    description: a.description,
    summary: a.summary,
    image_url: a.image_url,
    published_at: a.published_at,
    source_name: a.sources?.name ?? "Unknown",
    tags: a.sources?.custom_tags ?? [],
    is_bookmarked: true,
  };
}

export default function BookmarksPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bookmarks")
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json();
      })
      .then((rows: BookmarkRow[]) => {
        const mapped = rows.map(toArticle).filter((a): a is Article => a !== null);
        setArticles(mapped);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Couldn't load bookmarks.");
      })
      .finally(() => setLoading(false));
  }, []);

  function handleBookmark(id: string, bookmarked: boolean) {
    if (!bookmarked) {
      // Optimistically remove from list when unbookmarked
      setArticles((prev) => prev.filter((a) => a.id !== id));
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-bg-surface border-b border-border">
        <div className="max-w-[720px] mx-auto px-4 h-12 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm min-w-[44px] min-h-[44px] -ml-2 px-2"
            aria-label="Go back"
          >
            <svg
              width="16"
              height="16"
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
            Back
          </button>

          <div className="flex items-center gap-2 flex-1">
            <h1 className="text-sm font-semibold text-text-primary">Bookmarks</h1>
            {!loading && !error && (
              <span className="text-xs text-text-secondary bg-bg-base border border-border px-1.5 py-0.5 rounded-full">
                {articles.length}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[720px] mx-auto">
        {loading && (
          <div className="flex items-center justify-center py-16 text-text-secondary text-sm">
            Loading…
          </div>
        )}

        {error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-text-secondary">{error}</p>
          </div>
        )}

        {!loading && !error && articles.length === 0 && (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-text-secondary">
              No bookmarks yet. Tap the bookmark icon on any article to save it.
            </p>
          </div>
        )}

        {!loading && !error && articles.length > 0 && (
          <ul>
            {articles.map((article) => (
              <li key={article.id}>
                <ArticleCard article={article} onBookmark={handleBookmark} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
