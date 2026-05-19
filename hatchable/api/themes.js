import { db } from "hatchable";

export const access = "viewer";
export const methods = ["GET"];

export default async function (req, res) {
  // Include themes from cached AND live-fetched sets.
  const { rows } = await db.query(
    `SELECT theme, COUNT(*)::int AS n
       FROM lego_sets
       WHERE theme IS NOT NULL AND theme <> ''
       GROUP BY theme
       ORDER BY n DESC, theme ASC`
  );
  res.json({ themes: rows });
}
