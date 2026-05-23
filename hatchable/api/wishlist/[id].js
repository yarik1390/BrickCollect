// DELETE /api/wishlist/:id — remove from wishlist
// POST   /api/wishlist/:id/read — mark alert as read

import { db } from "hatchable";
import { getCallerId } from "../_lib/caller.js";

export const access = "viewer";
export const methods = ["DELETE", "POST"];

export default async function (req, res) {
  const userId = getCallerId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  if (req.method === "DELETE") {
    const { rowCount } = await db.query(
      "DELETE FROM user_wishlist WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.status(204).send("");
  }

  // POST — mark a wishlist_alert as read (id is the alert id here)
  const { rowCount } = await db.query(
    "UPDATE wishlist_alerts SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL",
    [id, userId]
  );
  if (rowCount === 0) return res.status(404).json({ error: "Not found or already read" });
  res.json({ ok: true });
}
