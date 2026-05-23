-- migrations/004_improvements.sql
-- Schema additions from the 2026-05 audit:
--   1) Rate-limit tracking (per user, per endpoint, per hour window)
--   2) purchased_at timestamp on user_collection (distinct from added_at)
--   3) Soft-delete on user_collection
--   4) Valuation expiry on lego_sets

-- 1) Rate limits -------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id      TEXT        NOT NULL,
  endpoint     TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('hour', now()),
  hit_count    INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint, window_start)
);
-- Prune rows older than 48 hours (run periodically or on-write)
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);

-- 2) purchased_at -------------------------------------------------------
ALTER TABLE user_collection
  ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ;

-- 3) Soft-delete --------------------------------------------------------
ALTER TABLE user_collection
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Existing queries filter on user_id; now they should also filter
-- WHERE deleted_at IS NULL.  The index below makes that fast.
CREATE INDEX IF NOT EXISTS user_collection_active_idx
  ON user_collection (user_id)
  WHERE deleted_at IS NULL;

-- 4) Valuation expiry ---------------------------------------------------
ALTER TABLE lego_sets
  ADD COLUMN IF NOT EXISTS valuation_expires_at TIMESTAMPTZ;

-- Back-fill: mark all existing rows as expiring 30 days from migration
UPDATE lego_sets
   SET valuation_expires_at = now() + INTERVAL '30 days'
 WHERE valuation_expires_at IS NULL;
