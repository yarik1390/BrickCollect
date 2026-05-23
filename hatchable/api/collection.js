import { db } from "hatchable";
import { getCallerId } from "./_lib/caller.js";

export const access = "viewer";
export const methods = ["GET", "POST"];

export default async function (req, res) {
  const userId = getCallerId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  if (req.method === "GET") {
    const { rows } = await db.query(
      `SELECT c.id, c.set_num, c.quantity, c.condition,
              c.purchase_price::float AS purchase_price,
              c.notes, c.added_at, c.purchased_at,
              s.name, s.theme, s.year, s.pieces, s.minifigs,
              s.retail_price::float  AS retail_price,
              s.current_value::float AS current_value,
              s.forecast_2y::float   AS forecast_2y,
              s.forecast_5y::float   AS forecast_5y,
              s.image_url, s.includes_minifigs
         FROM user_collection c
         JOIN lego_sets s ON s.set_num = c.set_num
        WHERE c.user_id = $1
          AND c.deleted_at IS NULL
        ORDER BY c.added_at DESC`,
      [userId]
    );

    const totalValue = rows.reduce(
      (sum, r) => sum + Number(r.current_value || 0) * Number(r.quantity || 1),
      0
    );
    const totalPaid = rows.reduce(
      (sum, r) =>
        sum + Number(r.purchase_price || r.retail_price || 0) * Number(r.quantity || 1),
      0
    );

    return res.json({
      items:         rows,
      total_value:   Number(totalValue.toFixed(2)),
      total_paid:    Number(totalPaid.toFixed(2)),
      count:         rows.length,
      minifig_count: rows.filter(r => r.includes_minifigs).length,
    });
  }

  // POST -- add or upsert quantity / condition for a set
  const {
    set_num,
    quantity = 1,
    condition = "new",
    purchase_price = null,
    notes = "",
    purchased_at = null,
  } = req.body || {};

  if (!set_num) return res.status(400).json({ error: "set_num required" });
  if (quantity < 1) return res.status(400).json({ error: "quantity must be at least 1" });

  const VALID_CONDITIONS = ["new", "used_good", "used_acceptable", "sealed"];
  if (!VALID_CONDITIONS.includes(condition)) {
    return res.status(400).json({ error: `condition must be one of: ${VALID_CONDITIONS.join(", ")}` });
  }
  if (purchase_price !== null && (isNaN(Number(purchase_price)) || Number(purchase_price) < 0)) {
    return res.status(400).json({ error: "purchase_price must be a non-negative number" });
  }

  const setCheck = await db.query("SELECT 1 FROM lego_sets WHERE set_num = $1", [set_num]);
  if (setCheck.rows.length === 0) {
    return res.status(404).json({ error: "Unknown set_num" });
  }

  const { rows } = await db.query(
    `INSERT INTO user_collection (user_id, set_num, quantity, condition, purchase_price, notes, purchased_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, set_num) DO UPDATE
       SET quantity       = EXCLUDED.quantity,
           condition      = EXCLUDED.condition,
           purchase_price = EXCLUDED.purchase_price,
           notes          = EXCLUDED.notes,
           purchased_at   = COALESCE(EXCLUDED.purchased_at, user_collection.purchased_at)
     RETURNING id, quantity, condition, purchased_at`,
    [userId, set_num, quantity, condition, purchase_price, notes, purchased_at || null]
  );
  res.status(201).json({ entry: rows[0] });
}
