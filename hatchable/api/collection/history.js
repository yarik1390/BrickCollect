// GET /api/collection/history
// Returns portfolio value snapshots for the past N days (default 90).
// Used by the portfolio sparkline chart.

import { db } from "hatchable";
import { getCallerId } from "../_lib/caller.js";

export const access = "viewer";
export const methods = ["GET"];

export default async function (req, res) {
  const userId = getCallerId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const days = Math.min(parseInt(req.query.days || "90", 10), 365);

  const { rows } = await db.query(
    `SELECT snapshot_at, total_value::float, total_paid::float, set_count
       FROM portfolio_snapshots
      WHERE user_id = $1
        AND snapshot_at >= now() - ($2 || ' days')::interval
      ORDER BY snapshot_at ASC`,
    [userId, days]
  );

  res.json({ snapshots: rows, days });
}
