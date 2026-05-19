import { db } from "hatchable";
import { getCallerId } from "../_lib/caller.js";

export const access = "viewer";
export const methods = ["DELETE", "PATCH"];

export default async function (req, res) {
  const userId = getCallerId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  if (req.method === "DELETE") {
    const { rowCount } = await db.query(
      "DELETE FROM user_collection WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.status(204).send("");
  }

  // PATCH — update quantity / condition / notes
  const { quantity, condition, notes, purchase_price } = req.body || {};
  if (quantity !== undefined && quantity < 1) return res.status(400).json({ error: "quantity must be at least 1" });
  const { rows } = await db.query(
    `UPDATE user_collection
        SET quantity       = COALESCE($3, quantity),
            condition      = COALESCE($4, condition),
            notes          = COALESCE($5, notes),
            purchase_price = COALESCE($6, purchase_price)
      WHERE id = $1 AND user_id = $2
      RETURNING id, quantity, condition`,
    [id, userId, quantity, condition, notes, purchase_price]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Not found" });
  res.json({ entry: rows[0] });
}
