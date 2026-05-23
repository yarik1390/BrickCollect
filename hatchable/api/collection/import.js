// POST /api/collection/import
// Accepts a CSV file (same format as /api/collection/export) and upserts
// the rows into the user's collection.
//
// Required CSV columns: set_num, quantity
// Optional: condition, purchase_price, notes, purchased_at, added_at
//
// Sets not found in the local catalog are skipped with an error entry.

import { db } from "hatchable";
import { getCallerId } from "../_lib/caller.js";

export const access = "viewer";
export const methods = ["POST"];

const VALID_CONDITIONS = ["new", "used_good", "used_acceptable", "sealed"];

export default async function (req, res) {
  const userId = getCallerId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  // Accept either a file upload (multipart) or raw CSV text body
  let csvText = "";
  if (req.files?.file) {
    csvText = Buffer.isBuffer(req.files.file.data)
      ? req.files.file.data.toString("utf8")
      : String(req.files.file.data || "");
  } else if (typeof req.body === "string") {
    csvText = req.body;
  } else if (req.body?.csv) {
    csvText = String(req.body.csv);
  } else {
    return res.status(400).json({ error: 'Send CSV as multipart file field "file", raw body, or JSON field "csv".' });
  }

  const rows = parseCsv(csvText.trim());
  if (rows.length === 0) return res.status(400).json({ error: "Empty or unparseable CSV" });

  const header = rows[0].map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const idx = (col) => header.indexOf(col);

  if (idx("set_num") === -1) {
    return res.status(400).json({ error: 'CSV must have a "set_num" column' });
  }

  const imported = [], skipped = [], errors = [];

  for (const raw of rows.slice(1)) {
    const get = (col) => (raw[idx(col)] || "").trim();

    const set_num = get("set_num");
    if (!set_num) continue;

    const quantity      = Math.max(1, parseInt(get("quantity") || "1", 10));
    const rawCondition  = get("condition") || "new";
    const condition     = VALID_CONDITIONS.includes(rawCondition) ? rawCondition : "new";
    const rawPrice      = parseFloat(get("purchase_price"));
    const purchase_price = !isNaN(rawPrice) && rawPrice >= 0 ? rawPrice : null;
    const notes         = get("notes") || "";
    const rawPurchased  = get("purchased_at") || get("added_at") || "";
    const purchased_at  = rawPurchased ? new Date(rawPurchased) : null;

    // Verify the set exists in our catalog
    const { rows: check } = await db.query(
      "SELECT 1 FROM lego_sets WHERE set_num = $1", [set_num]
    );
    if (check.length === 0) {
      skipped.push({ set_num, reason: "Not in catalog" });
      continue;
    }

    try {
      await db.query(
        `INSERT INTO user_collection
           (user_id, set_num, quantity, condition, purchase_price, notes, purchased_at, last_modified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (user_id, set_num) DO UPDATE
           SET quantity       = EXCLUDED.quantity,
               condition      = EXCLUDED.condition,
               purchase_price = COALESCE(EXCLUDED.purchase_price, user_collection.purchase_price),
               notes          = CASE WHEN EXCLUDED.notes <> '' THEN EXCLUDED.notes
                                     ELSE user_collection.notes END,
               purchased_at   = COALESCE(EXCLUDED.purchased_at, user_collection.purchased_at),
               last_modified  = now()`,
        [userId, set_num, quantity, condition, purchase_price, notes,
         purchased_at instanceof Date && !isNaN(purchased_at) ? purchased_at : null]
      );
      imported.push(set_num);
    } catch (e) {
      errors.push({ set_num, reason: e.message });
    }
  }

  res.json({
    imported: imported.length,
    skipped:  skipped.length,
    errors:   errors.length,
    details:  { imported, skipped, errors },
  });
}

// Minimal RFC-4180 CSV parser (handles quoted fields, embedded commas/newlines)
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuote = false;
  const push = () => { row.push(field); field = ""; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"')           { inQuote = false; }
      else                           { field += ch; }
    } else {
      if (ch === '"')                { inQuote = true; }
      else if (ch === ',')           { push(); }
      else if (ch === '\r' && next === '\n') { push(); rows.push(row); row = []; i++; }
      else if (ch === '\n' || ch === '\r')   { push(); rows.push(row); row = []; }
      else                           { field += ch; }
    }
  }
  push();
  if (row.length > 0) rows.push(row);
  return rows;
}
