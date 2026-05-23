// =============================================================
// GET /api/sets/:setnum
// Returns the full detail row for one set.
// Layered fetch strategy:
//   1) fresh AI valuation, not expired  → return immediately
//   2) formula_bulk OR expired AI       → upgrade/refresh valuation
//   3) cache miss / stale data          → fetch from Rebrickable + AI-valuate
// =============================================================

import { db } from "hatchable";
import { rebrickableEnabled, getSet, resolveThemeName } from "../_lib/rebrickable.js";
import { aiValuation } from "../_lib/valuation.js";
import { checkRateLimit } from "../_lib/rate_limit.js";
import { getCallerId } from "../_lib/caller.js";

export const access = "viewer";
export const methods = ["GET"];

const CACHE_DAYS = 7;
// AI valuation upgrades cost tokens; cap at 60 per user per hour.
const VALUATION_LIMIT = 60;

export default async function (req, res) {
  const setNum = req.params.setnum;

  const cached = await readCache(setNum);

  // 1) Fresh enough and valuation is current → done
  if (cached && !needsDataRefresh(cached) && !needsValuationUpgrade(cached)) {
    return res.json({ set: cached, source: cached.source || "cache" });
  }

  // 2) Valuation needs upgrade (formula_bulk or expired AI)
  if (cached && needsValuationUpgrade(cached) && !needsDataRefresh(cached)) {
    const userId = getCallerId(req);
    const ok = await checkRateLimit(userId || "anon", "set-valuation", VALUATION_LIMIT);
    if (!ok) {
      // Serve existing valuation rather than erroring
      return res.json({ set: cached, source: "cache", rate_limited: true });
    }
    try {
      const val = await aiValuation(cached);
      await db.query(
        `UPDATE lego_sets
            SET retail_price=$1, current_value=$2,
                forecast_2y=$3, forecast_5y=$4,
                retired=$5, description=$6,
                valuation_method=$7,
                valuation_expires_at = now() + interval '30 days',
                cached_at = now()
          WHERE set_num=$8`,
        [
          val.retail_price, val.current_value,
          val.forecast_2y, val.forecast_5y,
          val.retired, val.description || cached.description || "",
          val.method, setNum,
        ],
      );
      const updated = await readCache(setNum);
      return res.json({ set: updated, source: "cache+ai" });
    } catch (e) {
      console.warn("valuation upgrade failed; serving existing:", e.message);
      return res.json({ set: cached, source: "cache" });
    }
  }

  // 3) Cache miss or stale data — fetch from Rebrickable if configured.
  if (rebrickableEnabled()) {
    try {
      const raw = await getSet(setNum);
      if (!raw) {
        if (cached) return res.json({ set: cached, source: "stale-cache" });
        return res.status(404).json({ error: "Set not found" });
      }
      const themeName = await resolveThemeName(raw.theme_id);
      const merged = { ...raw, theme: themeName };
      const val = await aiValuation(merged);

      const row = {
        set_num:           merged.set_num,
        name:              merged.name,
        theme:             themeName,
        subtheme:          null,
        year:              merged.year,
        pieces:            merged.pieces,
        minifigs:          merged.minifigs,    // real count from Rebrickable
        retail_price:      val.retail_price,
        current_value:     val.current_value,
        forecast_2y:       val.forecast_2y,
        forecast_5y:       val.forecast_5y,
        image_url:         merged.image_url,
        includes_minifigs: merged.includes_minifigs,
        retired:           val.retired,
        description:       val.description || "",
        source:            "rebrickable",
        valuation_method:  val.method,
      };
      await upsertCache(row);
      return res.json({ set: row, source: "rebrickable" });
    } catch (e) {
      console.error("rebrickable fetch failed:", e.message);
      if (cached) return res.json({ set: cached, source: "stale-cache" });
      return res.status(502).json({ error: "Upstream failed", detail: e.message });
    }
  }

  // No Rebrickable; only cache.
  if (cached) return res.json({ set: cached, source: "cache" });
  return res.status(404).json({ error: "Set not found" });
}

// ────────────────────────────────────────────────────────────
function needsDataRefresh(row) {
  if (row.source === "seed") return false;
  if (row.source === "rebrickable_bulk") return false;
  if (!row.cached_at) return false;
  const ageDays = (Date.now() - new Date(row.cached_at).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > CACHE_DAYS;
}

function needsValuationUpgrade(row) {
  // formula_bulk rows always need AI upgrade
  if (row.valuation_method === "formula_bulk") return true;
  // AI valuation that has passed its expiry
  if (row.valuation_expires_at && new Date(row.valuation_expires_at) < new Date()) return true;
  return false;
}

async function readCache(setNum) {
  const { rows } = await db.query(
    `SELECT set_num, name, theme, subtheme, year, pieces, minifigs,
            retail_price::float  AS retail_price,
            current_value::float AS current_value,
            forecast_2y::float   AS forecast_2y,
            forecast_5y::float   AS forecast_5y,
            image_url, includes_minifigs, retired, description,
            cached_at, source, valuation_method, valuation_expires_at
       FROM lego_sets WHERE set_num = $1`,
    [setNum],
  );
  return rows[0] || null;
}

async function upsertCache(row) {
  await db.query(
    `INSERT INTO lego_sets
       (set_num, name, theme, subtheme, year, pieces, minifigs,
        retail_price, current_value, forecast_2y, forecast_5y,
        image_url, includes_minifigs, retired, description,
        cached_at, source, valuation_method,
        valuation_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
             now(), $16, $17, now() + interval '30 days')
     ON CONFLICT (set_num) DO UPDATE
       SET name=EXCLUDED.name, theme=EXCLUDED.theme, year=EXCLUDED.year,
           pieces=EXCLUDED.pieces, minifigs=EXCLUDED.minifigs,
           retail_price=EXCLUDED.retail_price,
           current_value=EXCLUDED.current_value,
           forecast_2y=EXCLUDED.forecast_2y,
           forecast_5y=EXCLUDED.forecast_5y,
           image_url=EXCLUDED.image_url,
           includes_minifigs=EXCLUDED.includes_minifigs,
           retired=EXCLUDED.retired,
           description=EXCLUDED.description,
           cached_at=now(),
           source=EXCLUDED.source,
           valuation_method=EXCLUDED.valuation_method,
           valuation_expires_at=now() + interval '30 days'`,
    [
      row.set_num, row.name, row.theme, row.subtheme, row.year,
      row.pieces, row.minifigs,
      row.retail_price, row.current_value, row.forecast_2y, row.forecast_5y,
      row.image_url, row.includes_minifigs, row.retired, row.description,
      row.source, row.valuation_method,
    ],
  );
}
