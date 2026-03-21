import type { Metadata } from 'next';
import FeedPage from '@/components/FeedPage';

export const metadata: Metadata = {
  title: 'AkAna',
  description: 'Your personal content feed.',
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <FeedPage />
    </main>
  );
}
