-- AkAna database schema
-- Run this in the Supabase SQL editor to set up the database.

-- Enable pg_trgm for similarity-based duplicate detection
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- RSS feed sources
CREATE TABLE sources (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  url              TEXT        NOT NULL UNIQUE,
  custom_tags      TEXT[]      DEFAULT '{}',
  active           BOOLEAN     DEFAULT true,
  click_weight     FLOAT       DEFAULT 0,
  last_fetched_at  TIMESTAMPTZ,
  last_error       TEXT,
  consecutive_errors INT       DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Fetched articles cached from RSS feeds
CREATE TABLE articles (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           UUID        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title               TEXT        NOT NULL,
  description         TEXT,
  summary             TEXT,
  content             TEXT,
  content_fetched_at  TIMESTAMPTZ,
  link                TEXT        NOT NULL UNIQUE,
  published_at        TIMESTAMPTZ,
  image_url           TEXT,
  is_duplicate        BOOLEAN     DEFAULT false,
  search_vector       TSVECTOR,
  fetched_at          TIMESTAMPTZ DEFAULT now()
);

-- Click tracking for implicit source weighting
CREATE TABLE click_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  UUID        NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  source_id   UUID        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL DEFAULT 'like' CHECK (type IN ('like', 'dislike')),
  clicked_at  TIMESTAMPTZ DEFAULT now()
);

-- Migration for existing databases (run this if the table already exists):
-- ALTER TABLE click_events ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'like' CHECK (type IN ('like', 'dislike'));

-- Reading points (synced across devices)
CREATE TABLE reading_points (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT        NOT NULL CHECK (type IN ('auto', 'manual')),
  article_id    UUID        NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  article_title TEXT        NOT NULL,
  label         TEXT        NOT NULL,
  saved_at      TIMESTAMPTZ DEFAULT now()
);

-- Bookmarks (saved articles to read later)
CREATE TABLE bookmarks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  UUID        NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (article_id)
);

-- Indexes
CREATE INDEX ON articles (published_at DESC);
CREATE INDEX ON articles (source_id);
CREATE INDEX ON articles (is_duplicate) WHERE is_duplicate = false;
CREATE INDEX ON articles USING gin (search_vector);
CREATE INDEX ON articles USING gin (title gin_trgm_ops);
CREATE INDEX ON sources USING gin (custom_tags);
CREATE INDEX ON click_events (source_id, clicked_at DESC);
CREATE INDEX ON reading_points (type, saved_at DESC);
CREATE INDEX ON bookmarks (article_id);

-- Auto-update search_vector when title or description changes
CREATE OR REPLACE FUNCTION articles_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER articles_search_vector_trigger
  BEFORE INSERT OR UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update();

-- Row Level Security
ALTER TABLE sources         ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_points  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks       ENABLE ROW LEVEL SECURITY;

-- Allow public read (personal app — route-level auth, not row-level)
CREATE POLICY "public read sources"         ON sources         FOR SELECT USING (true);
CREATE POLICY "public read articles"        ON articles        FOR SELECT USING (true);
CREATE POLICY "public read reading_points"  ON reading_points  FOR SELECT USING (true);
CREATE POLICY "public read bookmarks"       ON bookmarks       FOR SELECT USING (true);

-- All writes go through server-side API routes using the service role key,
-- which bypasses RLS by default — no insert/update/delete policies needed for anon.
