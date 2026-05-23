// GET /api/wishlist  — list wishlisted sets with current prices
// POST /api/wishlist — add a set (body: { set_num, target_price?, notes? })

import { db } from "hatchable";
import { getCallerId } from "./_lib/caller.js";

export const access = "viewer";
export const methods = ["GET", "POST"];

export default async function (req, res) {
  const userId = getCallerId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  if (req.method === "GET") {
    const [wishlist, alerts] = await Promise.all([
      db.query(
        `SELECT w.id, w.set_num, w.target_price::float, w.notes, w.added_at, w.alerted_at,
                s.name, s.theme, s.year, s.image_url,
                s.current_value::float AS current_value,
                s.forecast_2y::float   AS forecast_2y
           FROM user_wishlist w
           JOIN lego_sets s ON s.set_num = w.set_num
          WHERE w.user_id = $1
          ORDER BY w.added_at DESC`,
        [userId]
      ),
      db.query(
        `SELECT id, set_num, set_name, target_price::float, current_value::float, triggered_at
           FROM wishlist_alerts
          WHERE user_id = $1 AND read_at IS NULL
          ORDER BY triggered_at DESC`,
        [userId]
      ),
    ]);
    return res.json({ wishlist: wishlist.rows, unread_alerts: alerts.rows });
  }

  // POST — add or update a wishlist entry
  const { set_num, target_price = null, notes = "" } = req.body || {};
  if (!set_num) return res.status(400).json({ error: "set_num required" });
  if (target_price !== null && (isNaN(Number(target_price)) || Number(target_price) < 0)) {
    return res.status(400).json({ error: "target_price must be a non-negative number" });
  }

  const check = await db.query("SELECT 1 FROM lego_sets WHERE set_num = $1", [set_num]);
  if (check.rows.length === 0) return res.status(404).json({ error: "Unknown set_num" });

  const { rows } = await db.query(
    `INSERT INTO user_wishlist (user_id, set_num, target_price, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, set_num) DO UPDATE
       SET target_price = EXCLUDED.target_price,
           notes        = EXCLUDED.notes
     RETURNING id, set_num, target_price::float, notes, added_at`,
    [userId, set_num, target_price, notes]
  );
  res.status(201).json({ entry: rows[0] });
}
