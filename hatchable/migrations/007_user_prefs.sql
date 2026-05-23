CREATE TABLE IF NOT EXISTS user_preferences (
  user_id            TEXT PRIMARY KEY,
  display_name       TEXT,
  currency           TEXT NOT NULL DEFAULT 'USD',
  notify_price_drops BOOLEAN NOT NULL DEFAULT true,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
