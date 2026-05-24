-- migrations/005_history_wishlist.sql
-- Portfolio history snapshots, wishlist, wishlist alerts, and performance indexes.

-- 1) Portfolio snapshots (nightly) ------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id            SERIAL        PRIMARY KEY,
  user_id       TEXT          NOT NULL,
  snapshot_date DATE          NOT NULL DEFAULT CURRENT_DATE,
  snapshot_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  total_value   NUMERIC(12,2) NOT NULL,
  total_paid    NUMERIC(12,2),
  set_count     INTEGER       NOT NULL,
  UNIQUE (user_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS portfolio_snapshots_user_time
  ON portfolio_snapshots (user_id, snapshot_at DESC);

-- 2) Wishlist ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_wishlist (
  id           SERIAL       PRIMARY KEY,
  user_id      TEXT         NOT NULL,
  set_num      TEXT         NOT NULL REFERENCES lego_sets(set_num) ON DELETE CASCADE,
  target_price NUMERIC(10,2),
  notes        TEXT         NOT NULL DEFAULT '',
  added_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  alerted_at   TIMESTAMPTZ,
  UNIQUE (user_id, set_num)
);
CREATE INDEX IF NOT EXISTS user_wishlist_user_idx ON user_wishlist (user_id);

-- 3) Wishlist alerts (in-app; no email required) ----------------------
CREATE TABLE IF NOT EXISTS wishlist_alerts (
  id            SERIAL       PRIMARY KEY,
  user_id       TEXT         NOT NULL,
  set_num       TEXT         NOT NULL,
  set_name      TEXT         NOT NULL,
  target_price  NUMERIC(10,2) NOT NULL,
  current_value NUMERIC(10,2) NOT NULL,
  triggered_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  read_at       TIMESTAMPTZ
);
-- Fast unread lookup (used by the portfolio page badge)
CREATE INDEX IF NOT EXISTS wishlist_alerts_unread
  ON wishlist_alerts (user_id, triggered_at DESC)
  WHERE read_at IS NULL;

-- 4) last_modified on user_collection (for ETag) ----------------------
ALTER TABLE user_collection
  ADD COLUMN IF NOT EXISTS last_modified TIMESTAMPTZ NOT NULL DEFAULT now();

-- 5) Performance indexes for valuation/cron queries --------------------
CREATE INDEX IF NOT EXISTS lego_sets_valuation_method_idx
  ON lego_sets (valuation_method);
CREATE INDEX IF NOT EXISTS lego_sets_valuation_expires_idx
  ON lego_sets (valuation_expires_at);
CREATE INDEX IF NOT EXISTS lego_sets_cached_at_idx
  ON lego_sets (cached_at);
-- Composite for collection queries
CREATE INDEX IF NOT EXISTS user_collection_active_user_modified
  ON user_collection (user_id, last_modified DESC)
  WHERE deleted_at IS NULL;
