import { db } from "hatchable";
import { getCallerId } from "./_lib/caller.js";

export const access = "viewer";
export const methods = ["GET", "PATCH"];

// Seeded fun LEGO-themed display name generator
const ADJECTIVES = [
  "Cosmic", "Neon", "Golden", "Brick", "Turbo", "Stellar", "Atomic", "Ultra",
  "Mystic", "Hyper", "Arctic", "Chrome", "Pixel", "Sonic", "Solar", "Volt",
  "Shadow", "Crystal", "Prism", "Ninja",
];
const NOUNS = [
  "Builder", "Maestro", "Architect", "Wanderer", "Inventor", "Pioneer", "Nexus",
  "Commander", "Explorer", "Artisan", "Sentinel", "Ranger", "Vanguard", "Crafter",
  "Engineer", "Titan", "Sculptor", "Collector", "Master", "Vault",
];

function seededName(userId) {
  let h1 = 2166136261 >>> 0;
  let h2 = 3735928559 >>> 0;
  for (let i = 0; i < userId.length; i++) {
    const c = userId.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 16777619) >>> 0;
    h2 ^= c; h2 = Math.imul(h2, 2246822519) >>> 0;
  }
  return ADJECTIVES[h1 % ADJECTIVES.length] + " " + NOUNS[h2 % NOUNS.length];
}

export default async function (req, res) {
  const userId = getCallerId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  if (req.method === "PATCH") {
    const { display_name, currency, notify_price_drops } = req.body || {};
    const fields = [];
    const params = [userId];
    let p = 2;
    if (display_name !== undefined) { fields.push(`display_name = $${p++}`); params.push(String(display_name).slice(0, 40) || null); }
    if (currency    !== undefined) { fields.push(`currency = $${p++}`);     params.push(String(currency).slice(0, 8)); }
    if (notify_price_drops !== undefined) { fields.push(`notify_price_drops = $${p++}`); params.push(Boolean(notify_price_drops)); }
    if (fields.length === 0) return res.status(400).json({ error: "Nothing to update" });
    fields.push(`updated_at = now()`);
    await db.query(
      `INSERT INTO user_preferences (user_id, ${fields.map((f,i) => f.split(" = ")[0]).join(", ")})
       VALUES ($1, ${params.slice(1).map((_,i) => "$" + (i+2)).join(", ")})
       ON CONFLICT (user_id) DO UPDATE SET ${fields.join(", ")}`,
      params
    );
    return res.json({ ok: true });
  }

  // GET — return handle, prefs, and portfolio aggregate
  const [prefRows, statsRows] = await Promise.all([
    db.query("SELECT display_name, currency, notify_price_drops FROM user_preferences WHERE user_id = $1", [userId]),
    db.query(
      `SELECT COUNT(*)::int AS set_count,
              COALESCE(SUM(s.current_value * c.quantity), 0)::float  AS total_value,
              COALESCE(SUM(COALESCE(c.purchase_price, s.retail_price) * c.quantity), 0)::float AS total_paid
         FROM user_collection c
         JOIN lego_sets s ON s.set_num = c.set_num
        WHERE c.user_id = $1 AND c.deleted_at IS NULL`,
      [userId]
    ),
  ]);

  const prefs = prefRows.rows[0] || {};
  const stats = statsRows.rows[0] || {};
  const displayName = prefs.display_name || seededName(userId);

  // If no prefs row exists yet, auto-create with the seeded name
  if (!prefRows.rows[0]) {
    await db.query(
      `INSERT INTO user_preferences (user_id, display_name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, displayName]
    ).catch(() => {});
  }

  res.json({
    handle: userId,
    display_name: displayName,
    currency: prefs.currency || "USD",
    notify_price_drops: prefs.notify_price_drops !== false,
    portfolio_stats: {
      set_count:   stats.set_count   || 0,
      total_value: stats.total_value || 0,
      total_paid:  stats.total_paid  || 0,
    },
  });
}
