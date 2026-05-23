// POST /api/jobs/wishlist-alerts
// Cron: runs daily at 08:00 UTC.
// For each wishlist entry that has a target_price, check if the set's
// current_value has crossed (or met) the target. If so, insert a
// wishlist_alert row and mark the wishlist entry as alerted.
// Idempotent: skips entries alerted in the last 7 days.

import { db } from "hatchable";

export const access = "scheduler";
export const methods = ["POST"];

export default async function (req, res) {
  const { rows: triggered } = await db.query(
    `SELECT w.id, w.user_id, w.set_num, w.target_price::float,
            s.name AS set_name, s.current_value::float AS current_value
       FROM user_wishlist w
       JOIN lego_sets s ON s.set_num = w.set_num
      WHERE w.target_price IS NOT NULL
        AND s.current_value <= w.target_price
        AND (w.alerted_at IS NULL OR w.alerted_at < now() - interval '7 days')`
  );

  let alerted = 0;

  for (const row of triggered) {
    try {
      await db.query(
        `INSERT INTO wishlist_alerts
           (user_id, set_num, set_name, target_price, current_value)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.user_id, row.set_num, row.set_name, row.target_price, row.current_value]
      );
      await db.query(
        "UPDATE user_wishlist SET alerted_at = now() WHERE id = $1",
        [row.id]
      );
      alerted++;
    } catch (e) {
      console.warn(`[wishlist-alerts] failed for wishlist ${row.id}:`, e.message);
    }
  }

  res.json({ checked: triggered.length, alerted });
}
