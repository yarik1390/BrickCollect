import { db } from "hatchable";

export const access = "viewer";
export const methods = ["GET"];

export default async function (req, res) {
  const series = (req.query.series || "").trim();
  const rarity  = (req.query.rarity  || "").trim();
  const limit   = Math.min(parseInt(req.query.limit || "40", 10), 100);
  const random  = req.query.random === "true" || req.query.random === "1";

  const where = [];
  const params = [];
  let p = 1;

  if (series) {
    where.push(`series = $${p++}`);
    params.push(series);
  }
  if (rarity) {
    where.push(`rarity = $${p++}`);
    params.push(rarity);
  }

  const orderBy = random ? "RANDOM()" : "rarity DESC, value DESC";
  const sql = `
    SELECT fig_num, name, series, rarity, value::float AS value, image_url
    FROM minifigs
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY ${orderBy}
    LIMIT $${p}
  `;
  params.push(limit);

  const { rows } = await db.query(sql, params);

  // Distinct series list for filter chips
  const { rows: seriesRows } = await db.query(
    "SELECT DISTINCT series FROM minifigs ORDER BY series"
  );

  res.json({ minifigs: rows, series: seriesRows.map(r => r.series) });
}
