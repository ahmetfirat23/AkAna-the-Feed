'use client';

import { useReaderSettings } from '@/hooks/useReaderSettings';
import { ReaderToolbar } from '@/components/ReaderToolbar';

interface ReaderContentProps {
  content: string;
  title: string;
  byline: string | null;
  publishedAt: string;
  sourceName: string;
}

function formatDate(dateString: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

export function ReaderContent({
  content,
  title,
  byline,
  publishedAt,
  sourceName,
}: ReaderContentProps) {
  const { settings } = useReaderSettings();

  return (
    <>
      <div
        className={`reader-content max-w-[720px] mx-auto px-4 pb-24 ${
          settings.fontFamily === 'serif' ? 'font-serif' : 'font-sans'
        }`}
      >
        {/* Article header */}
        <header className="pt-8 pb-6">
          <h1 className="text-2xl font-semibold leading-snug mb-4" style={{ color: 'var(--reader-text)' }}>
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-medium">{sourceName}</span>
            {byline && (
              <>
                <span aria-hidden="true">·</span>
                <span>{byline}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
          </div>
        </header>

        {/* Article body — content is pre-sanitized via lib/sanitize.ts */}
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>

      <ReaderToolbar />
    </>
  );
}
