// POST /api/admin/batch-valuate
// Admin-triggered: upgrade formula_bulk sets to AI valuation now, up to ?limit=
// Useful for warming the cache after a bulk import without waiting for the cron.

import { admin, db } from "hatchable";
import { aiValuation } from "../_lib/valuation.js";

export const access = "admin";
export const methods = ["POST"];

export default async function (req, res) {
  const allowed = await admin.require(req, res);
  if (!allowed) return;

  const limit = Math.min(parseInt(req.query.limit || req.body?.limit || "50", 10), 200);

  const { rows: candidates } = await db.query(
    `SELECT set_num, name, theme, year, pieces, minifigs
       FROM lego_sets
      WHERE valuation_method = 'formula_bulk'
      ORDER BY cached_at ASC NULLS FIRST
      LIMIT $1`,
    [limit]
  );

  let upgraded = 0, failed = 0;
  const errors = [];

  for (const set of candidates) {
    try {
      const val = await aiValuation(set);
      await db.query(
        `UPDATE lego_sets
            SET retail_price=$1, current_value=$2,
                forecast_2y=$3, forecast_5y=$4,
                retired=$5, valuation_method=$6,
                valuation_expires_at = now() + interval '30 days',
                cached_at = now()
          WHERE set_num=$7`,
        [val.retail_price, val.current_value, val.forecast_2y, val.forecast_5y,
         val.retired, val.method, set.set_num]
      );
      upgraded++;
    } catch (e) {
      failed++;
      errors.push({ set_num: set.set_num, error: e.message });
    }
  }

  const { rows: remaining } = await db.query(
    "SELECT COUNT(*)::int AS n FROM lego_sets WHERE valuation_method = 'formula_bulk'"
  );

  res.json({
    processed: candidates.length,
    upgraded,
    failed,
    remaining_formula_bulk: remaining[0].n,
    errors: errors.slice(0, 20),
  });
}
