"use client";

import { useEffect, useState } from "react";

interface Source {
  id: string;
  name: string;
  url: string;
  custom_tags: string[];
  active: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
  consecutive_errors: number;
  created_at: string;
  like_count?: number;
  dislike_count?: number;
  view_count?: number;
  open_count?: number;
}

/** Returns a health indicator based on consecutive_errors and last_fetched_at */
function HealthDot({ source }: { source: Source }) {
  if (source.last_fetched_at === null) {
    return (
      <span title="Not yet fetched">
        <span className="inline-block w-2 h-2 rounded-full bg-[#9CA3AF]" aria-hidden="true" />
        <span className="sr-only">Not yet fetched</span>
      </span>
    );
  }
  if (source.consecutive_errors >= 3) {
    return (
      <span title={`Feed broken — ${source.last_error ?? "check URL"}`}>
        <span className="inline-block w-2 h-2 rounded-full bg-[#EF4444]" aria-hidden="true" />
        <span className="sr-only">Broken</span>
      </span>
    );
  }
  if (source.consecutive_errors >= 1) {
    return (
      <span title={`Warning — ${source.last_error ?? "recent error"}`}>
        <span className="inline-block w-2 h-2 rounded-full bg-[#F59E0B]" aria-hidden="true" />
        <span className="sr-only">Warning</span>
      </span>
    );
  }
  return (
    <span title="Healthy">
      <span className="inline-block w-2 h-2 rounded-full bg-[#22C55E]" aria-hidden="true" />
      <span className="sr-only">Healthy</span>
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
  return `${Math.floor(diffSec / 2592000)}mo ago`;
}

// ─── Login form ─────────────────────────────────────────────────────────────

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        setError("Wrong password.");
      }
    } catch {
      setError("Couldn't connect — check your network.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-base font-semibold text-text-primary mb-6">Admin — AkAna</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="password" className="block text-xs text-text-secondary mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-md text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:outline-2 focus-visible:outline-accent-primary focus-visible:outline-offset-0"
              placeholder="Enter admin password"
            />
          </div>
          {error && (
            <p className="text-xs text-[#EF4444]" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 px-4 py-2 text-sm font-semibold bg-accent-primary text-white rounded-md hover:opacity-90 transition-opacity duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Add source form ─────────────────────────────────────────────────────────

interface AddSourceFormProps {
  onAdded: (source: Source) => void;
}

function AddSourceForm({ onAdded }: AddSourceFormProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const allTags = [
      ...tags,
      ...tagInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ];
    const uniqueTags = [...new Set(allTags)];

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!url.trim()) {
      setError("URL is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), tags: uniqueTags }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      onAdded(body as Source);
      setName("");
      setUrl("");
      setTags([]);
      setTagInput("");
    } catch {
      setError("Couldn't add feed — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-bg-card border border-border rounded-md p-4">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Add feed</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label htmlFor="source-name" className="block text-xs text-text-secondary mb-1">
            Name
          </label>
          <input
            id="source-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-base border border-border rounded-md text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:outline-2 focus-visible:outline-accent-primary focus-visible:outline-offset-0"
            placeholder="Rock Paper Shotgun"
          />
        </div>
        <div>
          <label htmlFor="source-url" className="block text-xs text-text-secondary mb-1">
            RSS / Atom URL
            <span className="ml-2 font-normal">
              — for email newsletters,{" "}
              <a
                href="https://kill-the-newsletter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent-primary)] underline underline-offset-2"
              >
                get a feed URL here
              </a>
            </span>
          </label>
          <input
            id="source-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-base border border-border rounded-md text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:outline-2 focus-visible:outline-accent-primary focus-visible:outline-offset-0"
            placeholder="https://feeds.feedburner.com/…"
          />
        </div>
        <div>
          <label htmlFor="source-tags" className="block text-xs text-text-secondary mb-1">
            Tags{" "}
            <span className="font-normal opacity-70">(press Enter or comma to add)</span>
          </label>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 bg-accent-soft text-accent-primary text-xs font-medium px-2 py-0.5 rounded-full"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:opacity-70 transition-opacity duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-primary rounded-full"
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            id="source-tags"
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={addTag}
            className="w-full px-3 py-2 text-sm bg-bg-base border border-border rounded-md text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:outline-2 focus-visible:outline-accent-primary focus-visible:outline-offset-0"
            placeholder="Games, Indie…"
          />
        </div>
        {error && (
          <p className="text-xs text-[#EF4444]" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="self-start px-4 py-2 text-sm font-semibold bg-accent-primary text-white rounded-md hover:opacity-90 transition-opacity duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Adding…" : "Add feed"}
        </button>
      </form>
    </section>
  );
}

// ─── Source row ──────────────────────────────────────────────────────────────

function SourceRow({
  source,
  onDelete,
}: {
  source: Source;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: source.id }),
      });
      if (res.ok) {
        onDelete(source.id);
      }
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const displayUrl =
    source.url.length > 52 ? source.url.slice(0, 50) + "…" : source.url;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-b-0">
      {/* Health dot + meta */}
      <div className="flex items-center gap-2 mt-0.5 shrink-0">
        <HealthDot source={source} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-text-primary">{source.name}</span>
          {source.custom_tags.map((tag) => (
            <span
              key={tag}
              className="bg-accent-soft text-accent-primary text-xs font-medium px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-text-secondary hover:text-accent-primary transition-colors duration-150 mt-0.5 truncate"
          title={source.url}
        >
          {displayUrl}
        </a>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {source.last_fetched_at ? (
            <span className="text-xs text-text-secondary">
              Fetched {timeAgo(source.last_fetched_at)}
            </span>
          ) : (
            <span className="text-xs text-text-secondary">Not yet fetched</span>
          )}
          {source.consecutive_errors >= 1 && source.last_error && (
            <span className="text-xs text-[#EF4444] truncate max-w-[240px]" title={source.last_error}>
              {source.consecutive_errors >= 3
                ? "Feed broken — check URL"
                : `Last error: ${source.last_error}`}
            </span>
          )}
          {((source.view_count ?? 0) > 0 || (source.open_count ?? 0) > 0) && (
            <span className="text-xs text-text-secondary flex items-center gap-2">
              <span title="Articles seen">{source.view_count ?? 0} seen</span>
              <span title="Articles opened">{source.open_count ?? 0} opened</span>
              <span title="Click-through rate" className="tabular-nums">
                {source.view_count ? Math.round(((source.open_count ?? 0) / source.view_count) * 100) : 0}% CTR
              </span>
            </span>
          )}
          {((source.like_count ?? 0) > 0 || (source.dislike_count ?? 0) > 0) && (
            <span className="text-xs text-text-secondary flex items-center gap-2">
              <span title="Likes">♥ {source.like_count ?? 0}</span>
              <span title="Dislikes">↓ {source.dislike_count ?? 0}</span>
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50 ${
          confirmDelete
            ? "border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white"
            : "border-border text-text-secondary hover:border-[#EF4444] hover:text-[#EF4444]"
        }`}
        aria-label={confirmDelete ? `Confirm delete ${source.name}` : `Delete ${source.name}`}
      >
        {deleting ? "Deleting…" : confirmDelete ? "Confirm" : "Delete"}
      </button>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/sources").then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json() as Promise<Source[]>;
      }),
      fetch("/api/admin/source-stats").then((res) =>
        res.ok ? res.json() as Promise<{ source_id: string; like_count: number; dislike_count: number; view_count: number; open_count: number }[]> : []
      ).catch(() => []),
    ])
      .then(([sourcesData, stats]) => {
        const statsMap = new Map(
          (stats as { source_id: string; like_count: number; dislike_count: number; view_count: number; open_count: number }[]).map(
            (s) => [s.source_id, s]
          )
        );
        const merged = sourcesData.map((src) => {
          const s = statsMap.get(src.id);
          return { ...src, like_count: s?.like_count ?? 0, dislike_count: s?.dislike_count ?? 0, view_count: s?.view_count ?? 0, open_count: s?.open_count ?? 0 };
        });
        setSources(merged);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Couldn't load sources.");
      })
      .finally(() => setLoading(false));
  }, []);

  function handleAdded(source: Source) {
    setSources((prev) =>
      [...prev, source].sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  function handleDeleted(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleFetch() {
    setFetching(true);
    setFetchResult(null);
    try {
      const res = await fetch('/api/admin/refresh', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setFetchResult(`Done — ${data.inserted} new articles, ${data.errors} errors`);
        // Refresh source list and stats
        const [sourcesRes, statsRes] = await Promise.all([
          fetch('/api/sources'),
          fetch('/api/admin/source-stats'),
        ]);
        if (sourcesRes.ok) {
          const sourcesData: Source[] = await sourcesRes.json();
          const statsData: { source_id: string; like_count: number; dislike_count: number; view_count: number; open_count: number }[] =
            statsRes.ok ? await statsRes.json() : [];
          const statsMap = new Map(statsData.map((s) => [s.source_id, s]));
          setSources(
            sourcesData.map((src) => {
              const s = statsMap.get(src.id);
              return { ...src, like_count: s?.like_count ?? 0, dislike_count: s?.dislike_count ?? 0, view_count: s?.view_count ?? 0, open_count: s?.open_count ?? 0 };
            })
          );
        }
      } else {
        setFetchResult(`Error: ${data.error ?? res.status}`);
      }
    } catch {
      setFetchResult('Fetch failed — check connection');
    } finally {
      setFetching(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-bg-surface border-b border-border">
        <div className="max-w-[760px] mx-auto px-4 h-12 flex items-center justify-between gap-3">
          <h1 className="text-sm font-semibold text-text-primary">Admin — AkAna</h1>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm px-2 py-1 min-h-[44px] disabled:opacity-50"
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      <main className="max-w-[760px] mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Cron note + fetch button */}
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs text-text-secondary flex-1">
            Feeds refresh automatically every 30 minutes via cron.
          </p>
          <button
            onClick={handleFetch}
            disabled={fetching}
            className="shrink-0 text-xs px-3 py-1.5 rounded border border-border text-text-secondary hover:border-accent-primary hover:text-accent-primary transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetching ? 'Fetching…' : 'Fetch now'}
          </button>
          {fetchResult && (
            <p className="w-full text-xs text-text-secondary">{fetchResult}</p>
          )}
        </div>

        {/* Add source */}
        <AddSourceForm onAdded={handleAdded} />

        {/* Source list */}
        <section>
          <h2 className="text-sm font-semibold text-text-primary mb-3">
            Sources{" "}
            {!loading && !error && (
              <span className="text-xs font-normal text-text-secondary">
                ({sources.length})
              </span>
            )}
          </h2>

          {loading && (
            <p className="text-sm text-text-secondary py-4">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-[#EF4444] py-4" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && sources.length === 0 && (
            <p className="text-sm text-text-secondary py-4">
              No sources yet — add one above.
            </p>
          )}

          {!loading && !error && sources.length > 0 && (
            <div className="bg-bg-card border border-border rounded-md px-4">
              {sources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onDelete={handleDeleted}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── Page root ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  // We check auth by attempting GET /api/sources — if 200, we're logged in.
  // The GET /api/sources route is public (per architecture.md), so we instead
  // probe /api/auth/login with no body (will return 400, not 401 if unauthenticated),
  // which doesn't help. Instead, try a POST to /api/sources with no body — that
  // will return 401 if not logged in, 400 if logged in (body is missing).
  // Simplest safe approach: just show the login form, and if the first sources
  // fetch succeeds, show the dashboard. We track state as:
  //   - 'checking' (probing)
  //   - 'authed' (logged in)
  //   - 'unauthed' (need to log in)
  const [authState, setAuthState] = useState<"checking" | "authed" | "unauthed">("checking");

  useEffect(() => {
    // Probe auth: POST /api/sources with no body → 401 = unauthed, 400 = authed
    fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).then((res) => {
      if (res.status === 401) {
        setAuthState("unauthed");
      } else {
        // 400 (missing fields) or any other non-401 = session is valid
        setAuthState("authed");
      }
    }).catch(() => {
      setAuthState("unauthed");
    });
  }, []);

  if (authState === "checking") {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <span className="text-sm text-text-secondary">Loading…</span>
      </div>
    );
  }

  if (authState === "unauthed") {
    return <LoginForm onSuccess={() => setAuthState("authed")} />;
  }

  return <Dashboard onLogout={() => setAuthState("unauthed")} />;
}
