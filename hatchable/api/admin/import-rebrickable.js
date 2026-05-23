// =============================================================
// POST /api/admin/import-rebrickable
// Bulk-imports the Rebrickable catalog from their public CSV
// downloads (themes.csv.gz + sets.csv.gz). No API key needed
// for the CDN URLs. Idempotent — uses ON CONFLICT DO NOTHING
// for sets that already exist (preserves seeded curated rows).
//
// Runs synchronously and returns once complete. Expected
// duration: ~10-20 seconds for ~20,000 sets.
// =============================================================

import { db } from "hatchable";
import { fetchGzippedCsv } from "../_lib/csv_import.js";
import { formulaValuation } from "../_lib/valuation.js";

export const access = "admin";     // project owner only
export const methods = ["POST"];

const THEMES_URL = "https://cdn.rebrickable.com/media/downloads/themes.csv.gz";
const SETS_URL   = "https://cdn.rebrickable.com/media/downloads/sets.csv.gz";

const BATCH_SIZE = 500;            // rows per INSERT statement

export default async function (req, res) {
  // record the run
  const { rows: runRows } = await db.query(
    `INSERT INTO import_runs (status) VALUES ('running') RETURNING id`
  );
  const runId = runRows[0].id;

  try {
    // ─── 1) Themes ───────────────────────────────────────────
    const themesRows = await fetchGzippedCsv(THEMES_URL);
    // theme row shape: { id, parent_id, name }
    await db.query("BEGIN");
    try {
      // Wipe themes table — small, idempotent, simpler than upserting
      await db.query("DELETE FROM lego_themes");
      for (let i = 0; i < themesRows.length; i += BATCH_SIZE) {
        const chunk = themesRows.slice(i, i + BATCH_SIZE);
        const params = [];
        const values = chunk.map((r, idx) => {
          const base = idx * 3;
          params.push(
            parseInt(r.id, 10),
            r.name || "Other",
            r.parent_id ? parseInt(r.parent_id, 10) : null,
          );
          return `($${base + 1}, $${base + 2}, $${base + 3})`;
        }).join(",");
        await db.query(
          `INSERT INTO lego_themes (id, name, parent_id) VALUES ${values}`,
          params,
        );
      }
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }

    const themesLoaded = themesRows.length;
    await db.query(
      `UPDATE import_runs SET themes_loaded = $1 WHERE id = $2`,
      [themesLoaded, runId],
    );

    // Build an in-memory theme tree for root-name resolution
    const themeMap = new Map();
    themesRows.forEach(t => themeMap.set(parseInt(t.id, 10), {
      name: t.name || "Other",
      parent_id: t.parent_id ? parseInt(t.parent_id, 10) : null,
    }));
    function rootThemeName(id) {
      let curr = themeMap.get(id);
      if (!curr) return "Other";
      let leaf = curr.name;
      let guard = 0;
      while (curr?.parent_id && guard++ < 12) {
        const parent = themeMap.get(curr.parent_id);
        if (!parent) break;
        curr = parent;
      }
      return curr?.name || leaf || "Other";
    }

    // ─── 2) Sets ─────────────────────────────────────────────
    const setsRows = await fetchGzippedCsv(SETS_URL);
    // set row shape: { set_num, name, year, theme_id, num_parts, img_url }

    await db.query(
      `UPDATE import_runs SET sets_total = $1 WHERE id = $2`,
      [setsRows.length, runId],
    );

    let loaded = 0;
    let skipped = 0;

    // Use ON CONFLICT DO NOTHING so seeded/already-imported rows are preserved.
    // We compute a deterministic formula valuation for each row at import time;
    // the detail endpoint lazy-upgrades these to AI valuations on first view.
    for (let i = 0; i < setsRows.length; i += BATCH_SIZE) {
      const chunk = setsRows.slice(i, i + BATCH_SIZE);
      const params = [];
      const values = [];
      let p = 0;

      for (const r of chunk) {
        const setNum = (r.set_num || "").trim();
        if (!setNum) { skipped++; continue; }
        const name   = (r.name || setNum).trim();
        const year   = parseInt(r.year, 10) || 0;
        const themeId = r.theme_id ? parseInt(r.theme_id, 10) : null;
        const pieces = parseInt(r.num_parts, 10) || 0;
        const imageUrl = (r.img_url || "").trim();
        // Skip sets with no name / no parts (placeholder entries)
        if (!name || pieces === 0 && year < 1990) { skipped++; continue; }

        const theme = themeId ? rootThemeName(themeId) : "Other";
        const val = formulaValuation({ pieces, year, theme });

        params.push(
          setNum,                  // 1  set_num
          name,                    // 2  name
          theme,                   // 3  theme
          null,                    // 4  subtheme
          year,                    // 5  year
          pieces,                  // 6  pieces
          0,                       // 7  minifigs   (unknown from bulk dump)
          val.retail_price,        // 8  retail_price
          val.current_value,       // 9  current_value
          val.forecast_2y,         // 10 forecast_2y
          val.forecast_5y,         // 11 forecast_5y
          imageUrl,                // 12 image_url
          false,                   // 13 includes_minifigs
          val.retired,             // 14 retired
          "rebrickable_bulk",      // 15 source
          "formula_bulk",          // 16 valuation_method
        );

        const base = p * 16;
        values.push(
          `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},now(),$${base+15},$${base+16})`,
        );
        p++;
      }

      if (values.length === 0) continue;

      const sql = `
        INSERT INTO lego_sets
          (set_num, name, theme, subtheme, year, pieces, minifigs,
           retail_price, current_value, forecast_2y, forecast_5y,
           image_url, includes_minifigs, retired,
           cached_at, source, valuation_method)
        VALUES ${values.join(",")}
        ON CONFLICT (set_num) DO NOTHING
      `;
      const result = await db.query(sql, params);
      // changes/rowCount represents inserted rows
      loaded += result.rowCount || values.length;

      // Update progress every batch
      await db.query(
        `UPDATE import_runs SET sets_loaded = $1, sets_skipped = $2 WHERE id = $3`,
        [loaded, skipped, runId],
      );
    }

    await db.query(
      `UPDATE import_runs
         SET status='success', completed_at=now(),
             sets_loaded=$1, sets_skipped=$2
       WHERE id=$3`,
      [loaded, skipped, runId],
    );

    res.json({
      ok: true,
      run_id: runId,
      themes_loaded: themesLoaded,
      sets_loaded: loaded,
      sets_skipped: skipped,
      sets_total: setsRows.length,
    });
  } catch (e) {
    console.error("import failed:", e);
    try {
      await db.query(
        `UPDATE import_runs SET status='error', completed_at=now(), error=$1 WHERE id=$2`,
        [String(e.message || e).slice(0, 800), runId],
      );
    } catch {}
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
