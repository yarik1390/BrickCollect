import { db, admin } from "hatchable";

export const access = "admin";
export const methods = ["POST"];

export default async function (req, res) {
  await admin.require(req, res);

  // Rebrickable CDN bulk exports
  const MINIFIGS_URL     = "https://cdn.rebrickable.com/media/downloads/minifigs.csv.gz";

  let imported = 0;
  let skipped  = 0;

  try {
    // Fetch and decompress the gzip CSV
    const resp = await fetch(MINIFIGS_URL, { headers: { "Accept-Encoding": "gzip" } });
    if (!resp.ok) throw new Error(`Rebrickable returned ${resp.status}`);

    const buffer = await resp.arrayBuffer();
    // Decompress using Node DecompressionStream (available in modern Node / edge runtimes)
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(buffer));
    writer.close();
    const reader = ds.readable.getReader();
    const chunks = [];
    let done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      if (value) chunks.push(value);
      done = d;
    }
    const text = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc); merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array(0))
    );

    // Parse CSV (fig_num, name, num_parts, image_url — Rebrickable format)
    const lines = text.split("\n").filter(Boolean);
    const header = lines[0].toLowerCase().split(",");
    const col = (name) => header.indexOf(name);
    const figCol  = col("fig_num");
    const nameCol = col("name");
    const imgCol  = col("img_url");

    if (figCol < 0 || nameCol < 0) throw new Error("Unexpected CSV format from Rebrickable");

    const rows = lines.slice(1);
    const BATCH = 200;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      for (const line of batch) {
        const cols = parseCsvLine(line);
        const fig_num   = (cols[figCol]  || "").trim();
        const name      = (cols[nameCol] || "").trim();
        const image_url = imgCol >= 0 ? (cols[imgCol] || "").trim() : "";
        if (!fig_num || !name || fig_num === "fig_num") { skipped++; continue; }

        // Derive series from fig_num prefix (e.g. "col" → "Minifigures", "sw" → "Star Wars")
        const series = deriveSeriesFromFigNum(fig_num);

        await db.query(
          `INSERT INTO minifigs (fig_num, name, series, rarity, value, image_url, source)
           VALUES ($1, $2, $3, 'common', 0, $4, 'rebrickable')
           ON CONFLICT (fig_num) DO UPDATE SET
             name      = EXCLUDED.name,
             image_url = CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE minifigs.image_url END,
             source    = 'rebrickable'`,
          [fig_num, name, series, image_url]
        ).catch(() => { skipped++; });
        imported++;
      }
    }

    res.json({ ok: true, imported, skipped });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

function deriveSeriesFromFigNum(fig_num) {
  const prefix = fig_num.replace(/\d+.*$/, "").toLowerCase();
  const map = {
    col:  "Minifigures",
    sw:   "Star Wars",
    hp:   "Harry Potter",
    njo:  "Ninjago",
    sh:   "Super Heroes",
    idea: "Ideas",
    cty:  "City",
    cas:  "Castle",
    pi:   "Pirates",
    sp:   "Space",
  };
  return map[prefix] || "Other";
}

function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQ  = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === "," && !inQ) { result.push(cur); cur = ""; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}
