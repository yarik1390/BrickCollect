// GET /api/collection/stats
// Per-theme, per-year, and per-condition breakdowns for the portfolio.

import { db } from "hatchable";
import { getCallerId } from "../_lib/caller.js";

export const access = "viewer";
export const methods = ["GET"];

export default async function (req, res) {
  const userId = getCallerId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const [byTheme, byYear, byCondition] = await Promise.all([
    db.query(
      `SELECT s.theme,
              COUNT(DISTINCT c.set_num)::int              AS set_count,
              SUM(c.quantity)::int                        AS total_quantity,
              SUM(s.current_value::float * c.quantity)    AS total_value,
              COALESCE(SUM(c.purchase_price::float * c.quantity)
                FILTER (WHERE c.purchase_price IS NOT NULL), 0) AS total_paid,
              ROUND(100.0 * SUM(s.current_value::float * c.quantity) /
                NULLIF(SUM(SUM(s.current_value::float * c.quantity)) OVER (), 0), 1)
                                                          AS pct_of_portfolio
         FROM user_collection c
         JOIN lego_sets s ON s.set_num = c.set_num
        WHERE c.user_id = $1 AND c.deleted_at IS NULL
        GROUP BY s.theme
        ORDER BY total_value DESC`,
      [userId]
    ),
    db.query(
      `SELECT s.year,
              COUNT(DISTINCT c.set_num)::int              AS set_count,
              SUM(s.current_value::float * c.quantity)    AS total_value
         FROM user_collection c
         JOIN lego_sets s ON s.set_num = c.set_num
        WHERE c.user_id = $1 AND c.deleted_at IS NULL AND s.year > 0
        GROUP BY s.year
        ORDER BY s.year`,
      [userId]
    ),
    db.query(
      `SELECT condition,
              COUNT(*)::int AS count,
              SUM(current_value::float * quantity) AS total_value
         FROM user_collection c
         JOIN lego_sets s ON s.set_num = c.set_num
        WHERE c.user_id = $1 AND c.deleted_at IS NULL
        GROUP BY condition
        ORDER BY count DESC`,
      [userId]
    ),
  ]);

  res.json({
    by_theme:     byTheme.rows,
    by_year:      byYear.rows,
    by_condition: byCondition.rows,
  });
}
