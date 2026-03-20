import type { Metadata } from 'next';
import FeedScroller from '@/components/FeedScroller';
import HomeHeader from '@/components/HomeHeader';

export const metadata: Metadata = {
  title: 'AkAna',
  description: 'Your personal content feed.',
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <HomeHeader />
      <FeedScroller />
    </main>
  );
}
