// POST /api/jobs/valuate-sets
// Cron: runs hourly. Upgrades up to 50 formula_bulk sets to AI valuation,
// oldest first. Also re-valuates sets whose valuation_expires_at has passed.
// Idempotent: safe to fire twice (ON CONFLICT / WHERE guard).

import { db } from "hatchable";
import { aiValuation } from "../_lib/valuation.js";

export const access = "scheduler";
export const methods = ["POST"];

const BATCH = 50;

export default async function (req, res) {
  // Pick the oldest formula_bulk sets AND any sets with expired valuations
  const { rows: candidates } = await db.query(
    `(SELECT set_num, name, theme, year, pieces, minifigs, 'formula_bulk' AS reason
        FROM lego_sets
       WHERE valuation_method = 'formula_bulk'
       ORDER BY cached_at ASC NULLS FIRST
       LIMIT $1)
     UNION ALL
     (SELECT set_num, name, theme, year, pieces, minifigs, 'expired' AS reason
        FROM lego_sets
       WHERE valuation_expires_at < now()
         AND valuation_method <> 'formula_bulk'
       ORDER BY valuation_expires_at ASC
       LIMIT $1)
     LIMIT $1`,
    [BATCH]
  );

  let upgraded = 0, failed = 0;

  for (const set of candidates) {
    try {
      const val = await aiValuation(set);
      await db.query(
        `UPDATE lego_sets
            SET retail_price=$1, current_value=$2,
                forecast_2y=$3, forecast_5y=$4,
                retired=$5,
                valuation_method=$6,
                valuation_expires_at = now() + interval '30 days',
                cached_at = now()
          WHERE set_num=$7`,
        [val.retail_price, val.current_value, val.forecast_2y, val.forecast_5y,
         val.retired, val.method, set.set_num]
      );
      upgraded++;
    } catch (e) {
      console.warn(`[valuate-sets] failed for ${set.set_num}:`, e.message);
      failed++;
    }
  }

  res.json({ candidates: candidates.length, upgraded, failed });
}
