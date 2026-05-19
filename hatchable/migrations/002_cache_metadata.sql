-- Add columns for cache freshness + barcode lookup.
ALTER TABLE lego_sets ADD COLUMN IF NOT EXISTS upc         text;
ALTER TABLE lego_sets ADD COLUMN IF NOT EXISTS cached_at   timestamptz DEFAULT now();
ALTER TABLE lego_sets ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'seed';
ALTER TABLE lego_sets ADD COLUMN IF NOT EXISTS valuation_method text NOT NULL DEFAULT 'curated';

CREATE INDEX IF NOT EXISTS lego_sets_upc_idx       ON lego_sets (upc);
CREATE INDEX IF NOT EXISTS lego_sets_cached_at_idx ON lego_sets (cached_at);
