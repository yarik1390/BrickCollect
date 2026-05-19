// =============================================================
// GET /api/admin/import-status
// Returns the most recent import run, plus aggregate catalog
// counts so the Settings page can show "X sets indexed".
// =============================================================

import { db } from "hatchable";

export const access = "viewer";
export const methods = ["GET"];

export default async function (req, res) {
  const [runs, totals, sources] = await Promise.all([
    db.query(
      `SELECT id, started_at, completed_at, status,
              themes_loaded, sets_loaded, sets_skipped, sets_total, error
         FROM import_runs
         ORDER BY started_at DESC
         LIMIT 1`,
    ),
    db.query(`SELECT COUNT(*)::int AS n FROM lego_sets`),
    db.query(
      `SELECT source, COUNT(*)::int AS n
         FROM lego_sets GROUP BY source ORDER BY n DESC`,
    ),
  ]);

  res.json({
    last_run: runs.rows[0] || null,
    catalog_count: totals.rows[0]?.n || 0,
    by_source: sources.rows,
  });
}
