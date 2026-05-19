// =============================================================
// Scan / identify
// Two modes:
//   1) Image — take a photo, send to Claude vision, get set_num
//   2) Barcode — give a UPC/EAN, look it up (when barcode lookup
//      is available; otherwise hint to user)
// =============================================================

import { ai, db } from "hatchable";
import { rebrickableEnabled, getSet, resolveThemeName } from "../_lib/rebrickable.js";

export const access = "viewer";
export const methods = ["POST"];

export default async function (req, res) {
  const { mode = "image", image, barcode } = req.body || {};

  if (mode === "barcode") return identifyByBarcode(res, barcode);
  if (mode === "image")   return identifyByImage(res, image);

  return res.status(400).json({ error: "unknown mode" });
}

// ----- image-based identification (Claude vision) -------------
async function identifyByImage(res, dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") {
    return res.status(400).json({ error: "image (data URL) required" });
  }

  // Parse a data: URL into media_type + base64.
  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) return res.status(400).json({ error: "image must be a base64 data URL" });
  const mediaType = m[1];
  const base64    = m[2];

  // Hard cap on the size we'll send to the model.
  if (base64.length > 6_000_000) {
    return res.status(413).json({ error: "image too large" });
  }

  const system = [
    "You are a LEGO product-identification expert.",
    "The user shows you a photograph of a LEGO product — box art, instruction cover, the assembled model, or even a partial scene.",
    "Identify the set. Return JSON ONLY (no prose) in this exact shape:",
    "  { ",
    '    "set_num":   "<official LEGO set number, e.g. 71043 or 75192>",',
    '    "name":      "<set name>",',
    '    "confidence":"high" | "medium" | "low",',
    '    "reasoning": "<one short sentence>"',
    "  }",
    "If you cannot identify any LEGO set in the image, return:",
    '  { "set_num": null, "name": null, "confidence": "none", "reasoning": "<why>" }',
    "Important: set_num must be the bare numeric ID, not the -1 / -2 variant suffix.",
  ].join("\n");

  let parsed;
  try {
    const r = await ai.generateText({
      purpose: "scan-identify",
      model:   "sonnet",
      system,
      messages: [{
        role: "user",
        content: [
          { type: "text",  text: "Which LEGO set is this? Respond with JSON only." },
          { type: "image", image: dataUrl },
        ],
      }],
      maxTokens: 300,
    });

    if (r.finishReason === "length") {
      return res.status(502).json({ error: "model truncated response" });
    }

    const txt = (r.text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    parsed = JSON.parse(txt);
  } catch (e) {
    return res.status(502).json({ error: "vision call failed", detail: e.message });
  }

  if (!parsed.set_num) {
    return res.json({
      identified: false,
      confidence: parsed.confidence || "none",
      reasoning:  parsed.reasoning  || "could not identify",
    });
  }

  // Resolve to a real DB row. Try the bare number first, then with -1 suffix
  // (Rebrickable uses 71043-1; vendor barcodes use 71043). Also accept the
  // exact identifier the model gave back.
  const candidates = uniq([
    String(parsed.set_num),
    String(parsed.set_num) + "-1",
  ]);

  for (const cand of candidates) {
    const found = await resolveSet(cand);
    if (found) {
      return res.json({
        identified: true,
        confidence: parsed.confidence || "medium",
        reasoning:  parsed.reasoning,
        set: found,
      });
    }
  }

  // Found by AI but not in our catalog/Rebrickable
  return res.json({
    identified: true,
    confidence: "low",
    reasoning:  `Identified as ${parsed.name || parsed.set_num} but not found in catalog`,
    suggestion: { set_num: parsed.set_num, name: parsed.name },
  });
}

// ----- barcode lookup ----------------------------------------
async function identifyByBarcode(res, code) {
  if (!code) return res.status(400).json({ error: "barcode required" });
  // 1) check our own cache
  const { rows } = await db.query(
    "SELECT set_num FROM lego_sets WHERE upc = $1 LIMIT 1",
    [String(code)]
  );
  if (rows[0]) {
    const found = await resolveSet(rows[0].set_num);
    if (found) return res.json({ identified: true, confidence: "high", set: found });
  }

  // 2) Without a barcode→set lookup service, we ask Claude to do the
  //    inverse mapping based on packaging conventions / set search.
  //    LEGO UPCs (5+ digit prefix is brand-coded but not deterministic).
  //    Best-effort fallback: tell the client we couldn't resolve it and
  //    let them switch to image scanning.
  return res.json({
    identified: false,
    confidence: "none",
    reasoning: "Barcode not in catalog. Try a photo scan instead.",
  });
}

// ----- helpers -----------------------------------------------
function uniq(arr) { return Array.from(new Set(arr)); }

async function resolveSet(setNum) {
  // Cache first
  const { rows } = await db.query(
    `SELECT set_num, name, theme, year, pieces, minifigs,
            retail_price::float  AS retail_price,
            current_value::float AS current_value,
            image_url
       FROM lego_sets WHERE set_num = $1`,
    [setNum]
  );
  if (rows[0]) return rows[0];

  // Live lookup
  if (!rebrickableEnabled()) return null;
  try {
    const raw = await getSet(setNum);
    if (!raw) return null;
    const themeName = await resolveThemeName(raw.theme_id);
    // Don't valuate/cache here — the detail endpoint will do that.
    return {
      set_num:  raw.set_num,
      name:     raw.name,
      theme:    themeName,
      year:     raw.year,
      pieces:   raw.pieces,
      minifigs: raw.minifigs,
      image_url: raw.image_url,
    };
  } catch {
    return null;
  }
}
