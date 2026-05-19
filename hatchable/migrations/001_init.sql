-- Catalog of LEGO sets (curated)
CREATE TABLE IF NOT EXISTS lego_sets (
  set_num            text PRIMARY KEY,
  name               text NOT NULL,
  theme              text NOT NULL,
  subtheme           text,
  year               int NOT NULL,
  pieces             int NOT NULL DEFAULT 0,
  minifigs           int NOT NULL DEFAULT 0,
  retail_price       numeric(10,2) NOT NULL DEFAULT 0,
  current_value      numeric(10,2) NOT NULL DEFAULT 0,
  forecast_2y        numeric(10,2) NOT NULL DEFAULT 0,
  forecast_5y        numeric(10,2) NOT NULL DEFAULT 0,
  image_url          text NOT NULL DEFAULT '',
  includes_minifigs  boolean NOT NULL DEFAULT true,
  retired            boolean NOT NULL DEFAULT false,
  description        text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS lego_sets_theme_idx ON lego_sets (theme);
CREATE INDEX IF NOT EXISTS lego_sets_year_idx  ON lego_sets (year);
CREATE INDEX IF NOT EXISTS lego_sets_name_idx  ON lego_sets (name);

-- A user's owned items
CREATE TABLE IF NOT EXISTS user_collection (
  id           serial PRIMARY KEY,
  user_id      text NOT NULL,
  set_num      text NOT NULL REFERENCES lego_sets(set_num) ON DELETE CASCADE,
  quantity     int NOT NULL DEFAULT 1,
  condition    text NOT NULL DEFAULT 'new',
  purchase_price numeric(10,2),
  notes        text NOT NULL DEFAULT '',
  added_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, set_num)
);

CREATE INDEX IF NOT EXISTS user_collection_user_idx ON user_collection (user_id);

-- Optional: minifig catalog for the Blind Bag feature
CREATE TABLE IF NOT EXISTS minifigs (
  fig_num     text PRIMARY KEY,
  name        text NOT NULL,
  series      text NOT NULL,
  rarity      text NOT NULL DEFAULT 'common',
  value       numeric(10,2) NOT NULL DEFAULT 0,
  image_url   text NOT NULL DEFAULT ''
);
