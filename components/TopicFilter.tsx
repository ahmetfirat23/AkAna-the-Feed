"use client";

interface TopicFilterProps {
  tags: string[];
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
}

export default function TopicFilter({
  tags,
  activeTag,
  onTagChange,
}: TopicFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 py-2 bg-bg-surface border-b border-border">
      <button
        type="button"
        onClick={() => onTagChange(null)}
        className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary ${
          activeTag === null
            ? "bg-accent-primary text-white font-semibold"
            : "bg-bg-surface text-text-secondary hover:text-text-primary"
        }`}
      >
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onTagChange(tag)}
          className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary ${
            activeTag === tag
              ? "bg-accent-primary text-white font-semibold"
              : "bg-bg-surface text-text-secondary hover:text-text-primary"
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
