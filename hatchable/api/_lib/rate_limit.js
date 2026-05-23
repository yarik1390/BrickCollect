// DB-backed rate limiter (per user, per endpoint, per hour window).
// Works across multiple edge-function instances because state lives in Postgres.
//
// Usage:
//   const ok = await checkRateLimit(db, userId, 'scan-identify', 20);
//   if (!ok) return res.status(429).json({ error: 'Rate limit exceeded. Try again next hour.' });

import { db } from "hatchable";

export async function checkRateLimit(userId, endpoint, limitPerHour) {
  const { rows } = await db.query(
    `INSERT INTO rate_limits (user_id, endpoint, window_start, hit_count)
     VALUES ($1, $2, date_trunc('hour', now()), 1)
     ON CONFLICT (user_id, endpoint, window_start)
     DO UPDATE SET hit_count = rate_limits.hit_count + 1
     RETURNING hit_count`,
    [String(userId), endpoint],
  );
  return rows[0].hit_count <= limitPerHour;
}
