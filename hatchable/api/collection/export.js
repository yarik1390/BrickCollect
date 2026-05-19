import { db } from "hatchable";
import { getCallerId } from "../_lib/caller.js";

export const access = "viewer";
export const methods = ["GET"];

export default async function (req, res) {
  const userId = getCallerId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const { rows } = await db.query(
    `SELECT c.set_num, s.name, s.theme, s.year, c.quantity,
            c.purchase_price::float AS purchase_price,
            s.retail_price::float   AS retail_price,
            s.current_value::float  AS current_value,
            c.condition, c.added_at
       FROM user_collection c
       JOIN lego_sets s ON s.set_num = c.set_num
      WHERE c.user_id = $1
      ORDER BY c.added_at DESC`,
    [userId]
  );

  const esc = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
  const header = "set_num,name,theme,year,quantity,purchase_price,retail_price,current_value,condition,added_at";
  const csvRows = rows.map(r => [
    r.set_num,
    esc(r.name),
    esc(r.theme),
    r.year || "",
    r.quantity,
    r.purchase_price != null ? r.purchase_price.toFixed(2) : "",
    r.retail_price  != null ? r.retail_price.toFixed(2)  : "",
    r.current_value != null ? r.current_value.toFixed(2) : "",
    esc(r.condition),
    r.added_at ? new Date(r.added_at).toISOString().split("T")[0] : "",
  ].join(","));

  const csv = [header, ...csvRows].join("\n");
  const date = new Date().toISOString().split("T")[0];

  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="brickvault-${date}.csv"`);
  res.send(csv);
}
