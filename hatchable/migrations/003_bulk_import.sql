-- migrations/003_bulk_import.sql
-- ============================================================
-- Tracking table for bulk imports of the Rebrickable catalog
-- (themes.csv.gz, sets.csv.gz from cdn.rebrickable.com).
-- Also defensively adds the `description` column in case the
-- v1 init migration didn't include it on a particular install.
-- ============================================================

ALTER TABLE lego_sets ADD COLUMN IF NOT EXISTS description text;

CREATE TABLE IF NOT EXISTS import_runs (
  id              SERIAL      PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'running',  -- running | success | error
  themes_loaded   INTEGER     NOT NULL DEFAULT 0,
  sets_loaded     INTEGER     NOT NULL DEFAULT 0,
  sets_skipped    INTEGER     NOT NULL DEFAULT 0,
  sets_total      INTEGER,
  error           TEXT,
  source          TEXT        NOT NULL DEFAULT 'rebrickable_bulk'
);

CREATE INDEX IF NOT EXISTS import_runs_started_idx ON import_runs (started_at DESC);

-- A small lookup table for the theme tree so we can resolve
-- nested themes (e.g. "Star Wars > Ultimate Collector Series" → "Star Wars")
-- without keeping a memory-resident map at request time.
CREATE TABLE IF NOT EXISTS lego_themes (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  parent_id  INTEGER
);
CREATE INDEX IF NOT EXISTS lego_themes_parent_idx ON lego_themes (parent_id);
