// =============================================================
// Search sets — hybrid: Rebrickable live API + DB cache
// If REBRICKABLE_API_KEY is set, we search the full LEGO catalog
// and merge with locally-cached sets. Otherwise we query the
// seeded curated catalog only.
// =============================================================

import { db } from "hatchable";
import { rebrickableEnabled, searchSets, resolveThemeName } from "../_lib/rebrickable.js";
import { formulaValuation } from "../_lib/valuation.js";

export const access = "viewer";
export const methods = ["GET"];

export default async function (req, res) {
  const q     = (req.query.q || "").trim();
  const theme = (req.query.theme || "").trim();
  const limit = Math.min(parseInt(req.query.limit || "30", 10), 100);

  // 1) always include local cache (seeded + previously-fetched)
  const local = await searchLocal(q, theme, limit);

  // 2) if Rebrickable configured, fetch live too and merge
  let live = [];
  if (rebrickableEnabled() && q) {
    try {
      const remote = await searchSets(q, { limit: limit });
      // attach themes; throw a formula valuation onto each
      live = await Promise.all(remote.map(async (s) => {
        const themeName = await resolveThemeName(s.theme_id);
        if (theme && themeName !== theme) return null;
        const val = formulaValuation({
          pieces: s.pieces,
          year:   s.year,
          theme:  themeName,
        });
        return {
          set_num:       s.set_num,
          name:          s.name,
          theme:         themeName,
          subtheme:      null,
          year:          s.year,
          pieces:        s.pieces,
          minifigs:      s.minifigs,
          image_url:     s.image_url,
          includes_minifigs: s.includes_minifigs,
          retired:       val.retired,
          retail_price:  val.retail_price,
          current_value: val.current_value,
          forecast_2y:   val.forecast_2y,
          forecast_5y:   val.forecast_5y,
        };
      }));
      live = live.filter(Boolean);
    } catch (e) {
      console.warn("rebrickable search failed:", e.message);
    }
  }

  // Merge by set_num — local takes precedence (has cached AI prices)
  const seen = new Set();
  const merged = [];
  for (const s of local) { merged.push(s); seen.add(s.set_num); }
  for (const s of live)  { if (!seen.has(s.set_num)) merged.push(s); }

  res.json({
    sets: merged.slice(0, limit),
    source: rebrickableEnabled() ? "live+cache" : "cache",
  });
}

async function searchLocal(q, theme, limit) {
  const where = [];
  const params = [];
  let p = 1;
  if (q) {
    where.push(`(LOWER(name) LIKE $${p} OR LOWER(set_num) LIKE $${p})`);
    params.push("%" + q.toLowerCase() + "%");
    p++;
  }
  if (theme) {
    where.push(`theme = $${p}`);
    params.push(theme);
    p++;
  }
  const sql = `
    SELECT set_num, name, theme, subtheme, year, pieces, minifigs,
           retail_price::float  AS retail_price,
           current_value::float AS current_value,
           forecast_2y::float   AS forecast_2y,
           forecast_5y::float   AS forecast_5y,
           image_url, includes_minifigs, retired
    FROM lego_sets
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY current_value DESC
    LIMIT $${p}
  `;
  params.push(limit);
  const { rows } = await db.query(sql, params);
  return rows;
}
