import { db } from "hatchable";

export const access = "scheduler";
export const methods = ["POST"];

export default async function (req, res) {
  const { rows: users } = await db.query(
    `SELECT DISTINCT c.user_id
       FROM user_collection c
      WHERE c.deleted_at IS NULL
        AND c.user_id NOT IN (
          SELECT user_id FROM portfolio_snapshots
           WHERE snapshot_date = CURRENT_DATE
        )`
  );

  let snapped = 0;

  for (const { user_id } of users) {
    try {
      const { rows } = await db.query(
        `SELECT
           COALESCE(SUM(s.current_value::float * c.quantity), 0)   AS total_value,
           COALESCE(SUM(c.purchase_price::float * c.quantity)
             FILTER (WHERE c.purchase_price IS NOT NULL), NULL)     AS total_paid,
           COUNT(DISTINCT c.set_num)::int                           AS set_count
          FROM user_collection c
          JOIN lego_sets s ON s.set_num = c.set_num
         WHERE c.user_id = $1 AND c.deleted_at IS NULL`,
        [user_id]
      );
      const { total_value, total_paid, set_count } = rows[0];
      if (set_count === 0) continue;

      await db.query(
        `INSERT INTO portfolio_snapshots (user_id, snapshot_date, total_value, total_paid, set_count)
         VALUES ($1, CURRENT_DATE, $2, $3, $4)
         ON CONFLICT (user_id, snapshot_date) DO NOTHING`,
        [user_id, total_value, total_paid, set_count]
      );
      snapped++;
    } catch (e) {
      console.warn(`[snapshot] failed for user ${user_id}:`, e.message);
    }
  }

  res.json({ users: users.length, snapped });
}
