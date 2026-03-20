'use client';

// ReadingPointsPanel: slide-in drawer from the right for managing reading points.
// Auto-saved points appear at top; manual points below.

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useReadingPoints, type ReadingPoint } from '@/hooks/useReadingPoints';

interface ReadingPointsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** ID of the article currently visible at the top of the feed. */
  currentArticleId?: string | null;
  currentFeedMode?: string;
  currentTag?: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ReadingPointsPanel({
  isOpen,
  onClose,
  currentArticleId,
  currentFeedMode = 'foryou',
  currentTag = null,
}: ReadingPointsPanelProps) {
  const { points, savePoint, deletePoint, isLoading } = useReadingPoints();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const autoPoints = points.filter((p) => p.is_auto);
  const manualPoints = points.filter((p) => !p.is_auto);

  // Close on Escape key.
  useEffect(() => {
    if (!isOpen) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Trap focus within panel when open.
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  function handlePointClick(point: ReadingPoint) {
    // Navigate to the main feed with the point's mode/tag, then scroll to article.
    const mode = point.feed_mode ?? 'foryou';
    const tag = point.tag_filter ?? null;

    const params = new URLSearchParams({ mode });
    if (tag) params.set('tag', tag);
    if (point.article_id) params.set('scrollTo', point.article_id);

    router.push(`/?${params}`);
    onClose();
  }

  async function handleAddManual() {
    if (!currentArticleId) return;
    const label = `Manual — ${new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`;
    await savePoint(label, currentArticleId, currentFeedMode, currentTag, false);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-20 bg-black/40 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Reading points"
        tabIndex={-1}
        className={`fixed top-0 right-0 z-30 h-full w-[320px] max-w-full bg-bg-card border-l border-border flex flex-col transition-transform duration-200 ease-out outline-none ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-surface flex-shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">Reading Points</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reading points"
            className="flex items-center justify-center w-11 h-11 text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm -mr-2"
          >
            {/* Close (×) icon */}
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-10" aria-label="Loading points">
              <span
                className="block w-4 h-4 rounded-full border-2 border-border border-t-accent-primary animate-spin"
                aria-hidden="true"
              />
            </div>
          ) : (
            <>
              {/* Auto-saved section */}
              <section aria-label="Auto-saved reading points">
                <div className="px-4 pt-4 pb-1">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Autosaved
                  </p>
                </div>

                {autoPoints.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-text-secondary">
                    No auto-saves yet.
                  </p>
                ) : (
                  <ul>
                    {autoPoints.map((point, i) => (
                      <PointItem
                        key={point.id}
                        point={point}
                        label={point.label ?? `Auto save ${i + 1}`}
                        onNavigate={handlePointClick}
                        onDelete={deletePoint}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {/* Divider */}
              <div className="border-t border-border mx-4 my-2" aria-hidden="true" />

              {/* Manual section */}
              <section aria-label="Manually saved reading points">
                <div className="px-4 pt-2 pb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Saved by you
                  </p>
                  <button
                    type="button"
                    onClick={handleAddManual}
                    disabled={!currentArticleId || manualPoints.length >= 5}
                    aria-label="Save current position as a reading point"
                    className="text-xs font-medium text-accent-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm"
                  >
                    + Save current position
                  </button>
                </div>

                {manualPoints.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-text-secondary">
                    No saved points — tap "+ Save current position" to add one.
                  </p>
                ) : (
                  <ul>
                    {manualPoints.map((point) => (
                      <PointItem
                        key={point.id}
                        point={point}
                        label={point.label ?? 'Manual save'}
                        onNavigate={handlePointClick}
                        onDelete={deletePoint}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

interface PointItemProps {
  point: ReadingPoint;
  label: string;
  onNavigate: (point: ReadingPoint) => void;
  onDelete: (id: string) => Promise<void>;
}

function PointItem({ point, label, onNavigate, onDelete }: PointItemProps) {
  return (
    <li className="flex items-center gap-1 border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => onNavigate(point)}
        className="flex-1 text-left px-4 py-3 hover:bg-bg-surface transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-primary min-w-0"
      >
        <div className="text-xs text-text-secondary mb-0.5">
          {formatDate(point.created_at)}
          {point.feed_mode && (
            <span className="ml-2 bg-accent-soft text-accent-primary px-1.5 py-px rounded-full text-[11px] font-medium">
              {point.feed_mode === 'foryou' ? 'For You' : 'Chronological'}
            </span>
          )}
          {point.tag_filter && (
            <span className="ml-1 bg-accent-soft text-accent-primary px-1.5 py-px rounded-full text-[11px] font-medium">
              {point.tag_filter}
            </span>
          )}
        </div>
        <p className="text-sm text-text-primary leading-snug truncate">
          {point.article_title ?? label}
        </p>
      </button>

      {/* Delete button */}
      <button
        type="button"
        onClick={() => onDelete(point.id)}
        aria-label={`Delete reading point: ${label}`}
        className="flex-shrink-0 flex items-center justify-center w-11 h-11 text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded-sm"
      >
        {/* Trash icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </li>
  );
}
