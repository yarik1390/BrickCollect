-- Extend minifigs table with sourcing and timestamp fields
ALTER TABLE minifigs ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE minifigs ADD COLUMN IF NOT EXISTS source   TEXT NOT NULL DEFAULT 'seed';

CREATE INDEX IF NOT EXISTS minifigs_series_idx  ON minifigs (series);
CREATE INDEX IF NOT EXISTS minifigs_rarity_idx  ON minifigs (rarity);
CREATE INDEX IF NOT EXISTS minifigs_source_idx  ON minifigs (source);

-- Also add condition and notes columns to user_collection if not present
ALTER TABLE user_collection ADD COLUMN IF NOT EXISTS condition TEXT;
ALTER TABLE user_collection ADD COLUMN IF NOT EXISTS notes     TEXT NOT NULL DEFAULT '';
