"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ArticleCard, { Article } from "@/components/ArticleCard";

interface SearchResult {
  id: string;
  title: string;
  url: string;
  description: string | null;
  summary: string | null;
  image_url: string | null;
  published_at: string;
  source_name: string | null;
  tags: string[];
}

function toArticle(r: SearchResult): Article {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    description: r.description,
    summary: r.summary,
    image_url: r.image_url,
    published_at: r.published_at,
    source_name: r.source_name ?? "Unknown",
    tags: r.tags,
    is_bookmarked: false,
  };
}

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const body: { articles: SearchResult[]; error?: string } = await res.json();
        if (body.error) throw new Error(body.error);
        setResults((body.articles ?? []).map(toArticle));
        setSearched(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Search failed — try again.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleBookmark(id: string, bookmarked: boolean) {
    setResults((prev) =>
      prev.map((a) => (a.id === id ? { ...a, is_bookmarked: bookmarked } : a))
    );
  }

  const showEmpty = searched && !loading && !error && query.trim() && results.length === 0;
  const showResults = !loading && !error && results.length > 0;

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-bg-surface border-b border-border">
        <div className="max-w-[620px] mx-auto px-4 py-2 flex items-center gap-3 h-14">
          <button
            onClick={() => router.back()}
            className="flex items-center text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm min-w-[44px] min-h-[44px] shrink-0"
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
          </button>

          <div className="relative flex-1">
            <label htmlFor="search-input" className="sr-only">
              Search articles
            </label>
            <input
              ref={inputRef}
              id="search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-md text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:outline-2 focus-visible:outline-accent-primary focus-visible:outline-offset-0"
              placeholder="Search articles…"
              autoComplete="off"
              spellCheck="false"
            />
            {loading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary text-xs">
                …
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Results */}
      <main className="max-w-[620px] mx-auto">
        {/* Idle state */}
        {!query.trim() && !loading && (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-text-secondary">Type to search articles.</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-text-secondary">{error}</p>
          </div>
        )}

        {/* No results */}
        {showEmpty && (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-text-secondary">
              No articles found for &ldquo;{query.trim()}&rdquo;.
            </p>
          </div>
        )}

        {/* Results list */}
        {showResults && (
          <ul>
            {results.map((article) => (
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
