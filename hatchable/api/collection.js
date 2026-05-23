import { db } from "hatchable";
import { getCallerId } from "./_lib/caller.js";

export const access = "viewer";
export const methods = ["GET", "POST"];

const VALID_CONDITIONS = ["new", "used_good", "used_acceptable", "sealed"];
const VALID_SORTS = ["added_desc", "value_desc", "value_asc", "roi_desc", "name_asc"];

export default async function (req, res) {
  const userId = getCallerId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  if (req.method === "GET") {
    // Optional filter / sort / pagination params
    const q       = (req.query.q || "").trim().toLowerCase();
    const theme   = (req.query.theme || "").trim();
    const sort    = VALID_SORTS.includes(req.query.sort) ? req.query.sort : "added_desc";
    const perPage = Math.min(parseInt(req.query.per_page || "200", 10), 500);
    const page    = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset  = (page - 1) * perPage;

    // Always compute portfolio totals from the full (unfiltered) collection
    const [totalsResult, itemsResult] = await Promise.all([
      db.query(
        `SELECT
           COALESCE(SUM(s.current_value::float * c.quantity), 0)  AS total_value,
           COALESCE(SUM(
             COALESCE(c.purchase_price, s.retail_price)::float * c.quantity), 0) AS total_paid,
           COUNT(DISTINCT c.id)::int                               AS count,
           COUNT(DISTINCT c.id) FILTER (WHERE s.includes_minifigs) ::int AS minifig_count,
           MAX(c.last_modified)                                    AS last_modified
          FROM user_collection c
          JOIN lego_sets s ON s.set_num = c.set_num
         WHERE c.user_id = $1 AND c.deleted_at IS NULL`,
        [userId]
      ),
      db.query(
        `SELECT c.id, c.set_num, c.quantity, c.condition,
                c.purchase_price::float  AS purchase_price,
                c.notes, c.added_at, c.purchased_at,
                s.name, s.theme, s.year, s.pieces, s.minifigs,
                s.retail_price::float    AS retail_price,
                s.current_value::float   AS current_value,
                s.forecast_2y::float     AS forecast_2y,
                s.forecast_5y::float     AS forecast_5y,
                s.image_url, s.includes_minifigs,
                COUNT(*) OVER ()::int    AS total_filtered
           FROM user_collection c
           JOIN lego_sets s ON s.set_num = c.set_num
          WHERE c.user_id = $1
            AND c.deleted_at IS NULL
            AND ($2 = '' OR LOWER(s.name) LIKE '%' || $2 || '%'
                         OR LOWER(c.set_num) LIKE '%' || $2 || '%')
            AND ($3 = '' OR s.theme = $3)
          ORDER BY
            CASE WHEN $4 = 'value_desc' THEN s.current_value::float * c.quantity END DESC NULLS LAST,
            CASE WHEN $4 = 'value_asc'  THEN s.current_value::float * c.quantity END ASC  NULLS LAST,
            CASE WHEN $4 = 'roi_desc' AND c.purchase_price > 0
                 THEN (s.current_value - c.purchase_price)::float / c.purchase_price::float
            END DESC NULLS LAST,
            CASE WHEN $4 = 'name_asc'   THEN s.name END ASC NULLS LAST,
            c.added_at DESC
          LIMIT $5 OFFSET $6`,
        [userId, q, theme, sort, perPage, offset]
      ),
    ]);

    const totals = totalsResult.rows[0];
    const items  = itemsResult.rows;
    const totalFiltered = items[0]?.total_filtered ?? 0;

    // Attach annualized ROI to each item
    const now = Date.now();
    for (const r of items) {
      r.annualized_roi = null;
      if (r.purchase_price && r.purchased_at && r.current_value && r.purchase_price > 0) {
        const years = (now - new Date(r.purchased_at).getTime()) / (365.25 * 24 * 3600 * 1000);
        if (years >= 0.08) {
          r.annualized_roi = Math.pow(r.current_value / r.purchase_price, 1 / years) - 1;
        }
      }
    }

    // ETag: based on last_modified of the full collection
    const lastMod = totals.last_modified ? new Date(totals.last_modified).getTime() : 0;
    const etag = `"${totals.count}-${lastMod}"`;
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch === etag) return res.status(304).send("");

    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, no-cache");

    return res.json({
      items,
      total_value:     Number(Number(totals.total_value).toFixed(2)),
      total_paid:      Number(Number(totals.total_paid).toFixed(2)),
      count:           totals.count,
      total_filtered:  totalFiltered,
      page,
      per_page:        perPage,
      minifig_count:   totals.minifig_count,
    });
  }

  // POST — add or upsert quantity / condition for a set
  const {
    set_num,
    quantity    = 1,
    condition   = "new",
    purchase_price = null,
    notes       = "",
    purchased_at   = null,
  } = req.body || {};

  if (!set_num) return res.status(400).json({ error: "set_num required" });
  if (quantity < 1) return res.status(400).json({ error: "quantity must be at least 1" });

  if (!VALID_CONDITIONS.includes(condition)) {
    return res.status(400).json({ error: `condition must be one of: ${VALID_CONDITIONS.join(", ")}` });
  }
  if (purchase_price !== null && (isNaN(Number(purchase_price)) || Number(purchase_price) < 0)) {
    return res.status(400).json({ error: "purchase_price must be a non-negative number" });
  }

  const setCheck = await db.query("SELECT 1 FROM lego_sets WHERE set_num = $1", [set_num]);
  if (setCheck.rows.length === 0) return res.status(404).json({ error: "Unknown set_num" });

  const { rows } = await db.query(
    `INSERT INTO user_collection
       (user_id, set_num, quantity, condition, purchase_price, notes, purchased_at, last_modified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (user_id, set_num) DO UPDATE
       SET quantity       = EXCLUDED.quantity,
           condition      = EXCLUDED.condition,
           purchase_price = EXCLUDED.purchase_price,
           notes          = EXCLUDED.notes,
           purchased_at   = COALESCE(EXCLUDED.purchased_at, user_collection.purchased_at),
           last_modified  = now()
     RETURNING id, quantity, condition, purchased_at`,
    [userId, set_num, quantity, condition, purchase_price, notes, purchased_at || null]
  );
  res.status(201).json({ entry: rows[0] });
}
