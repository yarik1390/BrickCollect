// =============================================================
// Valuation engine
// Estimates retail price, current market value, and 2y/5y forecast
// from a set's real properties. Uses Claude for nuanced estimates;
// falls back to a deterministic formula when AI is unavailable.
// =============================================================

import { ai } from "hatchable";

const NOW_YEAR = new Date().getUTCFullYear();

// ---------------- deterministic fallback ----------------------
// Used when AI is unavailable, or as a sanity check on AI output.
// Based on published research into LEGO secondary-market behavior:
//   - Set retires ~2-3 years after release; price climbs ~10-12% / yr after retirement
//   - Active sets sell at retail ± 5%
//   - Larger / licensed sets command a premium

const THEME_MULT = {
  "Star Wars":         1.45,
  "Harry Potter":      1.35,
  "Creator Expert":    1.30,
  "Icons":             1.30,
  "Technic":           1.25,
  "Ideas":             1.40,
  "Ninjago":           1.10,
  "Architecture":      1.20,
  "City":              1.05,
  "Promotional":       1.80,
  "Master Builder Series": 1.50,
};

// Avg pence-per-piece for retail estimation across themes
const PPP_BY_THEME = {
  "Technic":           0.118,
  "Creator Expert":    0.105,
  "Icons":             0.095,
  "Star Wars":         0.115,
  "Harry Potter":      0.108,
  "Ideas":             0.102,
  "Architecture":      0.097,
  "Ninjago":           0.092,
  "City":              0.090,
  "default":           0.100,
};

function estimateRetail(pieces, theme) {
  const ppp = PPP_BY_THEME[theme] || PPP_BY_THEME.default;
  return Math.max(9.99, +(pieces * ppp).toFixed(2));
}

export function formulaValuation({ pieces, year, theme }) {
  const retail = estimateRetail(pieces, theme);
  const age    = Math.max(0, NOW_YEAR - (year || NOW_YEAR));
  const retired = age >= 3;   // heuristic: 3 yrs is the typical lifecycle
  const themeMult = THEME_MULT[theme] || 1.10;

  let current;
  if (retired) {
    // 12% compound after retirement (~3 years post-release)
    const post = Math.max(0, age - 2);
    current = retail * themeMult * Math.pow(1.12, Math.min(post, 8));
  } else if (age <= 1) {
    current = retail * 1.02;
  } else {
    current = retail * 1.10 * themeMult * 0.6;
  }

  // forecasts: assume continued retirement appreciation + market growth
  const forecast2 = current * Math.pow(1.09, 2);
  const forecast5 = current * Math.pow(1.075, 5);

  return {
    retail_price:  +retail.toFixed(2),
    current_value: +current.toFixed(2),
    forecast_2y:   +forecast2.toFixed(2),
    forecast_5y:   +forecast5.toFixed(2),
    retired,
    method: "formula",
  };
}

// ---------------- AI-driven valuation -------------------------
// Sends real set properties to Claude, asks for a structured JSON
// estimate that reflects collector-market behavior. Falls back to
// the formula if anything goes wrong.

export async function aiValuation(set) {
  // Build a tight system prompt that yields strict JSON.
  const system = [
    "You are a LEGO secondary-market analyst.",
    "Given a set's properties, estimate its retail price, current market value, and forecast prices in USD.",
    "Reflect real collector-market behavior: retired sets appreciate, active sets sit near retail, licensed and large sets command premiums.",
    "Return ONLY a JSON object with these keys and no other text:",
    "  retail_price   (number, USD)",
    "  current_value  (number, USD)",
    "  forecast_2y    (number, USD, current_value compounded ~2 yrs)",
    "  forecast_5y    (number, USD, current_value compounded ~5 yrs)",
    "  retired        (boolean, true if no longer in LEGO production)",
    "  description    (string, 1 sentence, 12-22 words)",
  ].join("\n");

  const userText = JSON.stringify({
    set_num:  set.set_num,
    name:     set.name,
    theme:    set.theme,
    year:     set.year,
    pieces:   set.pieces,
    minifigs: set.minifigs,
  });

  try {
    const r = await ai.generateText({
      purpose: "valuation",
      model:   "gpt-4o-mini",
      system,
      prompt:  userText,
      maxTokens: 600,
    });

    if (r.finishReason === "length") throw new Error("AI valuation truncated");
    const txt = (r.text || "").trim();
    // strip code fences if any
    const cleaned = txt.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(cleaned);

    // sanity-check
    if (
      typeof parsed.retail_price  !== "number" ||
      typeof parsed.current_value !== "number" ||
      typeof parsed.forecast_2y   !== "number" ||
      typeof parsed.forecast_5y   !== "number"
    ) throw new Error("AI returned invalid shape");

    return {
      retail_price:  +parsed.retail_price.toFixed(2),
      current_value: +parsed.current_value.toFixed(2),
      forecast_2y:   +parsed.forecast_2y.toFixed(2),
      forecast_5y:   +parsed.forecast_5y.toFixed(2),
      retired:       !!parsed.retired,
      description:   String(parsed.description || "").slice(0, 320),
      method:        "ai",
    };
  } catch (e) {
    console.warn("aiValuation fallback:", e.message);
    return formulaValuation(set);
  }
}
