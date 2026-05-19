// =============================================================
// Rebrickable API helper
// docs: https://rebrickable.com/api/v3/docs/
// Auth: `Authorization: key <REBRICKABLE_API_KEY>` header.
// =============================================================

const BASE = "https://rebrickable.com/api/v3";

export function rebrickableEnabled() {
  return !!process.env.REBRICKABLE_API_KEY;
}

async function rb(path) {
  const key = process.env.REBRICKABLE_API_KEY;
  if (!key) throw new Error("REBRICKABLE_API_KEY not configured");
  const r = await fetch(BASE + path, {
    headers: {
      "Authorization": `key ${key}`,
      "Accept": "application/json",
    },
  });
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error(`Rebrickable ${r.status}: ${await r.text().catch(() => r.statusText)}`);
  }
  return r.json();
}

// Search sets by free text. Rebrickable returns paginated results.
export async function searchSets(query, opts = {}) {
  const params = new URLSearchParams({
    page_size: String(opts.limit || 30),
    ordering: opts.ordering || "-year",
  });
  if (query) params.set("search", query);
  if (opts.theme_id) params.set("theme_id", String(opts.theme_id));
  if (opts.min_year) params.set("min_year", String(opts.min_year));

  const data = await rb(`/lego/sets/?${params}`);
  return (data?.results || []).map(normalizeSet);
}

// Get one set by set_num (e.g. "71043-1").
export async function getSet(setNum) {
  const data = await rb(`/lego/sets/${encodeURIComponent(setNum)}/`);
  return data ? normalizeSet(data) : null;
}

// Get theme name lookup.
let _themeCache = null;
export async function getThemes() {
  if (_themeCache) return _themeCache;
  // Themes endpoint is paginated; first page is enough for top-level themes.
  const data = await rb(`/lego/themes/?page_size=500`);
  const map = new Map();
  (data?.results || []).forEach((t) => map.set(t.id, t));
  _themeCache = map;
  return map;
}

// Walk theme chain back to root (Star Wars > Ultimate Collector Series → root is Star Wars).
export async function resolveThemeName(themeId) {
  if (!themeId) return "Other";
  try {
    const themes = await getThemes();
    let curr = themes.get(themeId);
    let leaf = curr?.name || "Other";
    // walk to root
    while (curr?.parent_id) {
      curr = themes.get(curr.parent_id);
    }
    const root = curr?.name || leaf;
    return root;
  } catch {
    return "Other";
  }
}

// Shape Rebrickable's response into our internal canonical row.
function normalizeSet(raw) {
  return {
    set_num:      raw.set_num,
    name:         raw.name,
    year:         raw.year || 0,
    pieces:       raw.num_parts || 0,
    minifigs:     raw.num_minifigs || 0,
    image_url:    raw.set_img_url || "",
    theme_id:     raw.theme_id,
    // these come from valuation:
    theme:        null,
    subtheme:     null,
    retail_price: null,
    current_value:null,
    forecast_2y:  null,
    forecast_5y:  null,
    retired:      false,
    description:  "",
    includes_minifigs: (raw.num_minifigs || 0) > 0,
  };
}
