import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { serviceRoleClient } from '@/lib/supabase';
import { fetchArticleContent } from '@/lib/reader';
import { ReaderContent } from '@/components/ReaderContent';
import { ArticleReaderHeader } from '@/components/ArticleReaderHeader';

type Props = {
  params: Promise<{ id: string }>;
};

interface ArticleRow {
  id: string;
  title: string;
  link: string;
  published_at: string;
  content: string | null;
  summary: string | null;
  source_id: string;
  sources: {
    name: string;
  } | null;
}

async function getArticle(id: string): Promise<ArticleRow | null> {
  const { data, error } = await serviceRoleClient
    .from('articles')
    .select('id, title, link, published_at, content, summary, source_id, sources(name)')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as ArticleRow;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const article = await getArticle(id);

  if (!article) {
    return { title: 'Article not found — AkAna' };
  }

  return {
    title: `${article.title} — AkAna`,
  };
}

export default async function ArticlePage({ params }: Props) {
  const { id } = await params;
  const article = await getArticle(id);

  if (!article) {
    notFound();
  }

  const sourceName = article.sources?.name ?? 'Unknown source';

  // Use cached content if available; otherwise fetch now
  let content = article.content;
  let byline: string | null = null;
  let readerTitle = article.title;
  let fetchFailed = false;

  if (!content) {
    const parsed = await fetchArticleContent(article.link);
    if (parsed?.content) {
      content = parsed.content;
      byline = parsed.byline;
      if (parsed.title) readerTitle = parsed.title;

      // Persist for next open — fire and forget
      serviceRoleClient
        .from('articles')
        .update({
          content: parsed.content,
          content_fetched_at: new Date().toISOString(),
        })
        .eq('id', id)
        .then(() => {})
        .catch(() => {});
    } else {
      fetchFailed = true;
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--reader-bg)', color: 'var(--reader-text)' }}
    >
      {/* Sticky reader header: back, bookmark, open-original */}
      <ArticleReaderHeader
        articleId={article.id}
        sourceId={article.source_id}
        articleUrl={article.link}
        articleTitle={article.title}
      />

      <main>
        {fetchFailed || !content ? (
          /* Error state — content could not be fetched */
          <div className="max-w-[720px] mx-auto px-4 pt-16 pb-24">
            <h1
              className="text-2xl font-semibold leading-snug mb-4"
              style={{ color: 'var(--reader-text)' }}
            >
              {article.title}
            </h1>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              {sourceName}
            </p>

            {article.summary && (
              <div
                className="mt-6 mb-8 p-4 border-l-4 text-sm leading-relaxed"
                style={{
                  borderColor: 'var(--accent-primary)',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                <p className="text-xs font-medium mb-2 uppercase tracking-wide" style={{ color: 'var(--accent-primary)' }}>
                  Summary
                </p>
                {article.summary}
              </div>
            )}

            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              The full article could not be loaded in reader mode.
            </p>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors duration-150"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
              }}
            >
              Open original
              <svg
                width="14"
                height="14"
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
        ) : (
          <ReaderContent
            content={content}
            title={readerTitle}
            byline={byline}
            publishedAt={article.published_at}
            sourceName={sourceName}
          />
        )}
      </main>
    </div>
  );
}
