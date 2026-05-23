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
      "UPDATE user_collection SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [id, userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.status(204).send("");
  }

  // PATCH — update quantity / condition / notes
  const { quantity, condition, notes, purchase_price, purchased_at } = req.body || {};
  if (quantity !== undefined && quantity < 1) return res.status(400).json({ error: "quantity must be at least 1" });

  const VALID_CONDITIONS = ["new", "used_good", "used_acceptable", "sealed"];
  if (condition !== undefined && !VALID_CONDITIONS.includes(condition)) {
    return res.status(400).json({ error: `condition must be one of: ${VALID_CONDITIONS.join(", ")}` });
  }
  if (purchase_price !== undefined && purchase_price !== null &&
      (isNaN(Number(purchase_price)) || Number(purchase_price) < 0)) {
    return res.status(400).json({ error: "purchase_price must be a non-negative number" });
  }
  const { rows } = await db.query(
    `UPDATE user_collection
        SET quantity       = COALESCE($3, quantity),
            condition      = COALESCE($4, condition),
            notes          = COALESCE($5, notes),
            purchase_price = COALESCE($6, purchase_price),
            purchased_at   = COALESCE($7, purchased_at)
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING id, quantity, condition, purchased_at`,
    [id, userId, quantity ?? null, condition ?? null, notes ?? null, purchase_price ?? null, purchased_at ?? null]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Not found" });
  res.json({ entry: rows[0] });
}
