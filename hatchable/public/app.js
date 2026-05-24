// =============================================================
// BRICKVAULT v2 — mobile-first LEGO portfolio
// Real camera scanning · live LEGO API · refined UX
// =============================================================

const API = (window.__HATCHABLE__ && window.__HATCHABLE__.api) || "/api";

const state = {
  portfolio: null,
  catalog: null,
  catalogAll: [],
  catalogPage: 1,
  catalogPageSize: 12,
  themes: [],
  themesLoadedAt: 0,
  me: null,
  filter: {
    kind: "all", theme: null, range: "1M", q: "",
    sort: localStorage.getItem("bv_sort") || "added_desc",
    catalogSort: "value_desc",
    catalogYear: "all",
    catalogRetired: false,
    wishlistSort: "recent",
  },
  toastTimer: null,
  detail: { tab: "info" },
  pwa: { deferredPrompt: null },
  wishlist: [],
  wishlistAlerts: [],
  portfolioHistory: null,
  // camera
  camera: {
    stream: null,
    mode: "barcode",          // 'barcode' | 'photo'
    detector: null,
    scanning: false,
    timer: null,
  },
};

// ===== utilities =============================================
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class")      node.className = attrs[k];
    else if (k === "style") Object.assign(node.style, attrs[k]);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else                    node.setAttribute(k, attrs[k]);
  }
  for (const kid of kids) {
    if (kid == null) continue;
    if (typeof kid === "string") node.appendChild(document.createTextNode(kid));
    else node.appendChild(kid);
  }
  return node;
}

function fmtMoney(n, dp = 2) {
  if (n == null || isNaN(n)) return "$0.00";
  const f = Number(n);
  return "$" + f.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtMoneyShort(n) {
  if (n == null || isNaN(n)) return "$0";
  const f = Number(n);
  if (f >= 1000) return "$" + Math.round(f).toLocaleString("en-US");
  return "$" + f.toFixed(2);
}
function pct(a, b) { if (!b) return 0; return ((a - b) / b) * 100; }

function haptic(style = "light") {
  if (navigator.vibrate) navigator.vibrate(style === "heavy" ? 30 : style === "medium" ? 15 : 8);
}

function toast(msg, kind = "") {
  const t = $("#toast");
  if (!t) return;
  t.className = "toast " + kind;
  const checkSVG = `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M5 10l3 3 7-7"/></svg>`;
  const errSVG   = `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6v4M10 14h.01M3 17l7-12 7 12H3z"/></svg>`;
  t.innerHTML = (kind === "success" ? checkSVG : kind === "error" ? errSVG : "") + `<span>${msg}</span>`;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => t.classList.remove("show"), kind === "error" ? 4000 : 2600);
}

// Deterministic noise from set_num so each set has a stable price history.
function seedRand(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

function buildHistory(seed, start, end, points = 30) {
  const rnd = seedRand(seed || "x");
  const out = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const eased = t * t * (3 - 2 * t);
    const trend = start + (end - start) * eased;
    const noise = (rnd() - 0.5) * (end - start) * 0.16;
    out.push(Math.max(0, trend + noise));
  }
  if (out.length) out[out.length - 1] = end;
  return out;
}

// =============================================================
// Chart (with optional touch scrubbing)
// =============================================================
function renderChart(container, values, opts = {}) {
  if (!container) return;
  if (!values || values.length === 0) {
    container.innerHTML = "";
    return;
  }
  const w = opts.w || 360;
  const ht = opts.h || 120;
  const pad = opts.pad ?? 6;
  const isUp = values[values.length - 1] >= values[0];
  const stroke = opts.stroke || (isUp ? "#2F6D43" : "#A53224");
  const showDot = opts.dot !== false;
  const showScrub = !!opts.scrubLabelFor;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = ht - pad - ((v - min) / span) * (ht - pad * 2);
    return [x, y];
  });

  // smooth curve through points (catmull-rom style is overkill; linear is honest)
  let line = "";
  points.forEach(([x, y], i) => {
    line += (i === 0 ? "M" : " L") + x.toFixed(1) + "," + y.toFixed(1);
  });
  const area = line +
    ` L${points[points.length - 1][0].toFixed(1)},${ht - pad}` +
    ` L${points[0][0].toFixed(1)},${ht - pad} Z`;

  const last = points[points.length - 1];
  const gid = "g" + Math.random().toString(36).slice(2, 8);

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="touch-action:none">
      <defs>
        <linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stop-color="${stroke}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${line}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      ${showDot ? `
        <circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="${stroke}"/>
        <circle cx="${last[0]}" cy="${last[1]}" r="9.5" fill="${stroke}" fill-opacity="0.18"/>
      ` : ""}
    </svg>
  `;

  if (showScrub) {
    // add scrubber elements
    const scrub = el("div", { class: "scrubber" });
    const label = el("div", { class: "scrubber-label" });
    container.style.position = "relative";
    container.appendChild(scrub);
    container.appendChild(label);
    attachScrub(container, points, values, w, ht, stroke, opts.scrubLabelFor);
  }
}

function attachScrub(container, points, values, vw, vh, stroke, fmt) {
  const svg = container.querySelector("svg");
  const scrub = container.querySelector(".scrubber");
  const label = container.querySelector(".scrubber-label");
  if (!svg || !scrub || !label) return;

  function pick(clientX) {
    const rect = svg.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.round(px * (points.length - 1));
    const x = points[idx][0];
    const v = values[idx];
    // convert to %
    const xPct = (x / vw) * 100;
    scrub.style.left = xPct + "%";
    label.style.left = xPct + "%";
    label.textContent = fmt(v);
    scrub.classList.add("show");
    label.classList.add("show");
  }
  function clear() {
    scrub.classList.remove("show");
    label.classList.remove("show");
  }
  svg.addEventListener("pointerdown", (e) => { e.preventDefault(); pick(e.clientX); });
  svg.addEventListener("pointermove", (e) => {
    if (e.buttons || e.pressure > 0 || e.pointerType === "touch") pick(e.clientX);
  });
  svg.addEventListener("pointerup",     clear);
  svg.addEventListener("pointercancel", clear);
  svg.addEventListener("pointerleave",  clear);
}

// =============================================================
// API client
// =============================================================
async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || "Request failed");
  }
  if (r.status === 204) return null;
  return r.json();
}

async function loadMe() {
  try { state.me = await api("/me"); } catch { state.me = null; }
}

async function loadPortfolio(opts = {}) {
  const params = new URLSearchParams();
  if (opts.q)    params.set("q", opts.q);
  if (opts.sort) params.set("sort", opts.sort);
  const qs = params.toString();
  state.portfolio = await api("/collection" + (qs ? "?" + qs : ""));
}
async function loadWishlist() {
  try {
    const r = await api("/wishlist");
    state.wishlist = r.wishlist || [];
    state.wishlistAlerts = r.unread_alerts || [];
  } catch { state.wishlist = []; state.wishlistAlerts = []; }
}
function isWishlisted(setNum) { return (state.wishlist || []).some(w => w.set_num === setNum); }
function wishlistEntryFor(setNum) { return (state.wishlist || []).find(w => w.set_num === setNum); }

async function loadCatalog(q = "", theme = null) {
  const params = new URLSearchParams();
  if (q)     params.set("q", q);
  if (theme) params.set("theme", theme);
  params.set("limit", "60");
  state.catalog = await api("/sets/search?" + params.toString());
  state.catalogAll = state.catalog?.sets || [];
  state.catalogPage = 1;
}
async function loadThemes() {
  const r = await api("/themes");
  state.themes = r.themes || [];
}
async function shareSet(set, entry) {
  const qty = entry ? entry.quantity : 1;
  const val = set.current_value * Math.max(qty, 1);
  const paid = entry?.purchase_price ? entry.purchase_price * qty : null;
  const roi = paid ? pct(val, paid) : null;
  const lines = [
    `${set.name} (#${set.set_num})`,
    `Current value: ${fmtMoney(val)}${roi != null ? ` (${roi >= 0 ? "+" : ""}${roi.toFixed(1)}% ROI)` : ""}`,
    `Theme: ${set.theme || "—"}`,
  ];
  const text = lines.join("\n");
  if (navigator.share) {
    try { await navigator.share({ title: set.name, text, url: location.href }); return; }
    catch {}
  }
  try {
    await navigator.clipboard.writeText(text + "\n" + location.href);
    toast("Copied to clipboard", "success");
  } catch { toast("Couldn't share", "error"); }
}

async function addToCollection(setNum, qty = 1) {
  return api("/collection", { method: "POST", body: { set_num: setNum, quantity: qty } });
}
async function removeFromCollection(id) {
  return api("/collection/" + id, { method: "DELETE" });
}
async function getSet(setNum) {
  return api("/sets/" + encodeURIComponent(setNum));
}
async function scanIdentify(payload) {
  return api("/scan/identify", { method: "POST", body: payload });
}

// =============================================================
// SVG Icon library
// =============================================================
const I = {
  search:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="9" r="6" stroke-linecap="round"/><path stroke-linecap="round" d="M18 18l-4-4"/></svg>`,
  filter:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" d="M3 6h14M6 10h8M9 14h2"/></svg>`,
  tag:     `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9V4a1 1 0 011-1h5l8 8-6 6-8-8z"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/></svg>`,
  check:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 10l4 4 8-8"/></svg>`,
  chev:    `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M8 5l5 5-5 5"/></svg>`,
  plus:    `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M10 4v12M4 10h12"/></svg>`,
  close:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M5 5l10 10M5 15L15 5"/></svg>`,
  box:     `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6l7-3 7 3v8l-7 3-7-3V6zM10 3v14M3 6l7 3 7-3"/></svg>`,
  share:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M10 3v10M6 7l4-4 4 4M5 13v3a1 1 0 001 1h8a1 1 0 001-1v-3"/></svg>`,
  heart:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.6"><path stroke-linecap="round" stroke-linejoin="round" d="M10 17s-7-4.5-7-10a4 4 0 017-2.65A4 4 0 0117 7c0 5.5-7 10-7 10z"/></svg>`,
  trend:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 14l5-5 4 4 5-7"/></svg>`,
  trendDn: `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6l5 5 4-4 5 7"/></svg>`,
  arrowR:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 10h10M11 6l4 4-4 4"/></svg>`,
  scan:    `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7V5a1 1 0 011-1h2M13 4h2a1 1 0 011 1v2M16 13v2a1 1 0 01-1 1h-2M7 16H5a1 1 0 01-1-1v-2"/><path stroke-linecap="round" d="M3 10h14"/></svg>`,
  build:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M14 6l2 2-7 7-3 .5.5-3 7-6.5z M11 4l3 3"/></svg>`,
  rocket:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M14 6c2-1 4-1 4-1s0 2-1 4l-1 1-4-4 2 0zM4 16s2-4 4-6l4 4c-2 2-6 4-6 4-1 0-3-1-2-2z"/></svg>`,
  sparkles:`<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.6"><path stroke-linecap="round" stroke-linejoin="round" d="M10 2l1.4 4.6L16 8l-4.6 1.4L10 14l-1.4-4.6L4 8l4.6-1.4L10 2z"/></svg>`,
  download:`<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M10 3v10M6 13l4 4 4-4M3 17h14"/></svg>`,
  pencil: `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M13 4l3 3-8 8-3.5.5.5-3.5 8-8zM11 6l3 3"/></svg>`,
  person: `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="7" r="3.5" stroke-linecap="round" stroke-linejoin="round"/><path stroke-linecap="round" stroke-linejoin="round" d="M3 18c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>`,
  trash:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h12M7 6V4a1 1 0 011-1h4a1 1 0 011 1v2M8 10v5M12 10v5M5 6l1 11a1 1 0 001 1h6a1 1 0 001-1l1-11"/></svg>`,
  gear:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="3" stroke-linecap="round"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"/></svg>`,
};

// =============================================================
// Top bar (shared)
// =============================================================
function topBar({ search = true, extra = "" } = {}) {
  return `
    <div class="top-bar">
      <div class="brand">
        <span class="brand-mark"></span>
        <span class="brand-name">Brickvault</span>
      </div>
      <div class="icon-row">
        ${extra}
        ${search ? `<a href="#/add" class="icon-btn" aria-label="Search">${I.search}</a>` : ""}
      </div>
    </div>
  `;
}

// =============================================================
// Portfolio page
// =============================================================
async function renderPortfolio() {
  const root = $("#root");
  // First paint: keep the existing skeleton; just show shell
  root.innerHTML = `
    <div class="page">
      ${topBar()}
      <div class="eyebrow mb-8">Collection</div>
      <h1 class="h-display mb-16">Portfolio</h1>
      <div class="hero">
        <div class="hero-label">Total collection value</div>
        <div class="skel line" style="height:54px;width:60%;margin:10px 0 14px"></div>
        <div class="skel" style="height:80px;border-radius:6px"></div>
      </div>
      <div class="filter-row">
        <span class="chip active">Loading…</span>
      </div>
      <div class="grid">
        <div class="skel card"></div><div class="skel card"></div>
      </div>
    </div>
  `;

  try {
    await Promise.all([
      loadPortfolio(),
      loadWishlist(),
      api("/collection/history?days=90").then(r => { state.portfolioHistory = r.snapshots || []; }).catch(() => {}),
    ]);
  } catch (e) {
    root.innerHTML = `
      <div class="page">${topBar()}
        <div class="empty">
          <h3>Couldn't load</h3>
          <p>${e.message}</p>
        </div>
      </div>`;
    return;
  }
  paintPortfolio();
}

function paintPortfolio() {
  const { items, total_value, total_paid } = state.portfolio;
  const sets = items;
  const minifigCount = sets.filter(s => s.includes_minifigs).length;
  const setCount     = sets.filter(s => !s.includes_minifigs).length;
  const root = $("#root");

  const start = total_paid || total_value * 0.85;
  const isEmpty = total_value === 0;
  const allSnapshots = state.portfolioHistory || [];

  // Filter snapshots by active range pill
  const rangeDays = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365, "ALL": Infinity };
  const days = rangeDays[state.filter.range] ?? 30;
  const cutoff = days === Infinity ? null : Date.now() - days * 86400_000;
  const snapshots = cutoff
    ? allSnapshots.filter(s => new Date(s.snapshot_at).getTime() >= cutoff)
    : allSnapshots;

  // Use real history if we have ≥2 data points, else synthetic fallback
  const points = isEmpty ? null
    : snapshots.length >= 2
      ? snapshots.map(s => s.total_value)
      : buildHistory("portfolio:" + items.length, start, total_value, 30);
  const histStart = snapshots.length >= 2 ? snapshots[0].total_value : start;
  const delta = total_value - histStart;
  const deltaPct = total_paid ? pct(total_value, total_paid) : pct(total_value, histStart);
  const deltaSign = delta >= 0 ? "up" : "down";
  const alertCount = (state.wishlistAlerts || []).length;

  // Compute display list: filter by kind (API handles sort and text search)
  const sort = state.filter.sort || "added_desc";
  let displaySets = [...sets];
  if (state.filter.kind === "minifigs") displaySets = displaySets.filter(s => s.includes_minifigs);
  else if (state.filter.kind === "sets") displaySets = displaySets.filter(s => !s.includes_minifigs);

  // Theme breakdown (top 6 themes by value)
  const themeMap = {};
  for (const s of sets) {
    const t = s.theme || "Other";
    themeMap[t] = (themeMap[t] || 0) + (s.current_value || 0) * (s.quantity || 1);
  }
  const themeGroups = Object.entries(themeMap).sort(([,a],[,b]) => b - a).slice(0, 6);

  root.innerHTML = `
    <div class="page">
      ${topBar({ extra: `
        ${alertCount > 0 ? `<button class="icon-btn" id="alertsBtn" aria-label="${alertCount} wishlist alert${alertCount > 1 ? 's' : ''}" style="position:relative">
          ${I.heart}<span class="wishlist-badge">${alertCount}</span>
        </button>` : ""}
        ${sets.length > 0 ? `<button class="icon-btn" id="exportBtn" aria-label="Export collection">${I.download}</button>` : ""}
      `.trim() })}
      <div class="eyebrow mb-8">Collection</div>
      <h1 class="h-display mb-16">Portfolio</h1>

      <div class="hero">
        <div class="hero-label">Total collection value</div>
        <div class="hero-value">
          <span class="sym">$</span>
          <span>${isEmpty ? "0.00" : Number(total_value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>

        ${isEmpty ? `
          <div class="hero-sub">
            <span class="hero-meta">Add items to track value</span>
          </div>
        ` : `
          <div class="hero-sub">
            <span class="delta ${deltaSign}">
              ${deltaSign === "up" ? I.trend : I.trendDn}
              <span>${delta >= 0 ? "+" : ""}${fmtMoneyShort(delta)}</span>
              <span style="opacity:.55">·</span>
              <span>${delta >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%</span>
            </span>
            <span class="hero-meta">${sets.length} ${sets.length === 1 ? "set" : "sets"}</span>
          </div>
          ${total_paid ? `<div class="hero-invested">Invested: ${fmtMoney(total_paid)}</div>` : ""}
        `}

        <div class="hero-chart" id="heroChart">
          ${isEmpty ? "" : ""}
        </div>

        <div class="segmented">
          ${["1D","1W","1M","3M","1Y","ALL"].map(r => `
            <button class="range-pill ${state.filter.range === r ? "active" : ""}" data-range="${r}">${r}</button>
          `).join("")}
        </div>
      </div>

      <div class="filter-row">
        <button class="chip ${state.filter.kind === "all" ? "active" : ""}" data-filter="all">
          All <span class="count">${sets.length}</span>
        </button>
        <button class="chip ${state.filter.kind === "sets" ? "active" : ""}" data-filter="sets">
          Sets <span class="count">${setCount}</span>
        </button>
        <button class="chip ${state.filter.kind === "minifigs" ? "active" : ""}" data-filter="minifigs">
          Minifigs <span class="count">${minifigCount}</span>
        </button>
        <select class="sort-pill" id="sortSel" aria-label="Sort by">
          <option value="added_desc" ${sort === "added_desc" ? "selected" : ""}>Recent</option>
          <option value="value_desc" ${sort === "value_desc" ? "selected" : ""}>Value ↓</option>
          <option value="value_asc"  ${sort === "value_asc"  ? "selected" : ""}>Value ↑</option>
          <option value="roi_desc"   ${sort === "roi_desc"   ? "selected" : ""}>ROI ↓</option>
          <option value="name_asc"   ${sort === "name_asc"   ? "selected" : ""}>A–Z</option>
        </select>
        <button class="icon-btn search-toggle-btn" id="portfolioSearchToggle" aria-label="Search collection">${I.search}</button>
      </div>
      <div class="portfolio-search-wrap ${state.filter.q ? "open" : ""}" id="portfolioSearchWrap">
        <div class="search-wrap mb-0">
          ${I.search}
          <input class="search-input" id="portfolioSearchInput" placeholder="Search your collection…" autocomplete="off" value="${state.filter.q || ""}">
          <button class="search-clear" id="portfolioSearchClear" style="display:${state.filter.q ? "flex" : "none"}" aria-label="Clear">${I.close}</button>
        </div>
      </div>

      ${sets.length === 0 ? renderEmptyPortfolio() : `
        <div class="set-list">
          ${displaySets.map(setListCardHTML).join("")}
        </div>
        ${themeGroups.length >= 2 ? `
          <div class="theme-section">
            <div class="eyebrow mb-10">By Theme</div>
            ${themeGroups.map(([theme, value]) => `
              <div class="theme-row">
                <span class="theme-lbl">${theme}</span>
                <div class="theme-bar-wrap">
                  <div class="theme-bar-fill" style="width:${(value / total_value * 100).toFixed(1)}%"></div>
                </div>
                <span class="theme-amt">${fmtMoneyShort(value)}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}
      `}
    </div>
  `;

  // Hide hero chart section when no data
  if (isEmpty) {
    const heroChart = $("#heroChart");
    if (heroChart) heroChart.style.display = "none";
    const segmented = $(".segmented");
    if (segmented) segmented.style.display = "none";
  } else {
    renderChart($("#heroChart"), points, {
      w: 360, h: 80, dot: true,
      scrubLabelFor: (v) => fmtMoneyShort(v),
    });
  }
  wireCardLongPress(".set-list");

  $$("[data-range]").forEach(b => b.addEventListener("click", () => {
    state.filter.range = b.dataset.range;
    paintPortfolio();
  }));
  $$("[data-filter]").forEach(b => b.addEventListener("click", () => {
    state.filter.kind = b.dataset.filter;
    paintPortfolio();
  }));
  $("#sortSel")?.addEventListener("change", async (e) => {
    state.filter.sort = e.target.value;
    localStorage.setItem("bv_sort", state.filter.sort);
    await loadPortfolio({ sort: state.filter.sort, q: state.filter.q });
    paintPortfolio();
  });

  // Portfolio text search
  const portfolioSearchToggle = $("#portfolioSearchToggle");
  const portfolioSearchWrap   = $("#portfolioSearchWrap");
  const portfolioSearchInput  = $("#portfolioSearchInput");
  const portfolioSearchClear  = $("#portfolioSearchClear");
  portfolioSearchToggle?.addEventListener("click", () => {
    portfolioSearchWrap?.classList.toggle("open");
    if (portfolioSearchWrap?.classList.contains("open")) portfolioSearchInput?.focus();
  });
  let pSearchTimer;
  portfolioSearchInput?.addEventListener("input", () => {
    clearTimeout(pSearchTimer);
    portfolioSearchClear.style.display = portfolioSearchInput.value ? "flex" : "none";
    const q = portfolioSearchInput.value.trim();
    pSearchTimer = setTimeout(async () => {
      state.filter.q = q;
      await loadPortfolio({ q, sort: state.filter.sort });
      paintPortfolio();
    }, 300);
  });
  portfolioSearchClear?.addEventListener("click", async () => {
    portfolioSearchInput.value = "";
    portfolioSearchClear.style.display = "none";
    state.filter.q = "";
    await loadPortfolio({ sort: state.filter.sort });
    paintPortfolio();
  });
  $("#exportBtn")?.addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = API + "/collection/export";
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast("Downloading collection…");
  });

  $("#alertsBtn")?.addEventListener("click", () => showAlertsSheet());
}

function renderEmptyPortfolio() {
  return `
    <div class="onboarding-card">
      <div class="onboarding-art">
        <svg width="72" height="72" viewBox="0 0 88 88" fill="none">
          <rect x="14" y="28" width="60" height="48" rx="6" fill="#F2EDE3" stroke="#C9BFA6" stroke-width="1.5"/>
          <circle cx="29" cy="24" r="4.5" fill="#B5762E" stroke="#0B1220" stroke-width="1.2"/>
          <circle cx="44" cy="24" r="4.5" fill="#B5762E" stroke="#0B1220" stroke-width="1.2"/>
          <circle cx="59" cy="24" r="4.5" fill="#B5762E" stroke="#0B1220" stroke-width="1.2"/>
          <path d="M22 50 L34 42 L46 50 L58 42 L66 50" stroke="#2F6D43" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <circle cx="66" cy="50" r="2.5" fill="#2F6D43"/>
        </svg>
      </div>
      <h3 class="onboarding-title">Start your vault</h3>
      <p class="onboarding-sub">Three ways to add your collection:</p>
      <div class="onboarding-steps">
        <a href="#/pile" class="onboarding-step">
          <span class="onboarding-step-icon">${I.scan}</span>
          <div>
            <div class="onboarding-step-title">Scan</div>
            <div class="onboarding-step-desc">Point camera at a box or barcode</div>
          </div>
          <span class="onboarding-step-chev">${I.chev}</span>
        </a>
        <a href="#/add" class="onboarding-step">
          <span class="onboarding-step-icon">${I.search}</span>
          <div>
            <div class="onboarding-step-title">Search</div>
            <div class="onboarding-step-desc">Browse the full LEGO catalog by name or set #</div>
          </div>
          <span class="onboarding-step-chev">${I.chev}</span>
        </a>
        <a href="/settings.html" class="onboarding-step">
          <span class="onboarding-step-icon">${I.download}</span>
          <div>
            <div class="onboarding-step-title">Import</div>
            <div class="onboarding-step-desc">Upload a CSV from Brickset or BrickLink</div>
          </div>
          <span class="onboarding-step-chev">${I.chev}</span>
        </a>
      </div>
    </div>
  `;
}

const CONDITION_LABELS = {
  "new":              "New",
  "sealed":           "Sealed (MISB)",
  "used_good":        "Used — Good",
  "used_acceptable":  "Used — Acceptable",
};

function setListCardHTML(item) {
  const v = item.current_value * item.quantity;
  const paid = (item.purchase_price || item.retail_price) * item.quantity;
  const d = pct(v, paid);
  const dSign = d >= 0 ? "up" : "down";
  const roiVal = item.annualized_roi != null
    ? item.annualized_roi
    : pct(item.current_value, item.retail_price);
  const roiSign = roiVal >= 0 ? "up" : "down";
  const isNew = item.added_at && (Date.now() - new Date(item.added_at).getTime() < 7 * 86400_000);
  return `
    <a class="set-list-card" href="#/set/${encodeURIComponent(item.set_num)}" data-id="${item.id}" data-setnum="${item.set_num}">
      <div class="sl-img">
        <img src="${item.image_url}" alt="${item.name}" loading="lazy" onerror="this.style.opacity=0.15">
        ${item.quantity > 1 ? `<span class="qty-badge">×${item.quantity}</span>` : ""}
        ${isNew ? `<span class="new-badge">NEW</span>` : ""}
      </div>
      <div class="sl-body">
        <div class="sl-name">${item.name}</div>
        <div class="sl-meta">#${item.set_num} · ${item.theme || "—"}</div>
        <div class="sl-roi ${roiSign}">${roiVal >= 0 ? "+" : ""}${roiVal.toFixed(1)}%${item.annualized_roi != null ? "/yr" : ""}</div>
      </div>
      <div class="sl-right">
        <div class="sl-value">${fmtMoney(v)}</div>
        ${paid ? `<div class="sl-delta ${dSign}">
          ${dSign === "up" ? I.trend : I.trendDn}
          ${d >= 0 ? "+" : ""}${d.toFixed(1)}%
        </div>` : ""}
      </div>
    </a>
  `;
}

function wireCardLongPress(containerSel) {
  $$(containerSel + " .set-list-card").forEach(card => {
    let longPressTimer = null;
    card.addEventListener("touchstart", (e) => {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        haptic("medium");
        e.preventDefault();
        showCardQuickActions(card);
      }, 500);
    }, { passive: true });
    const cancel = () => { clearTimeout(longPressTimer); longPressTimer = null; };
    card.addEventListener("touchend",   cancel, { passive: true });
    card.addEventListener("touchmove",  cancel, { passive: true });
    card.addEventListener("touchcancel", cancel, { passive: true });
  });
}

function showCardQuickActions(card) {
  const setNum = card.dataset.setnum;
  const id     = card.dataset.id;
  if (!setNum) return;
  const existing = $("#quickActionsMenu");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.id = "quickActionsMenu";
  menu.className = "quick-actions-menu";
  menu.innerHTML = `
    <div class="qa-item" data-action="view">${I.chev} View details</div>
    <div class="qa-item" data-action="edit">${I.pencil} Edit price / date</div>
    <div class="qa-item qa-danger" data-action="remove">${I.trash} Remove</div>
    <div class="qa-item qa-cancel" data-action="cancel">Cancel</div>
  `;
  document.body.appendChild(menu);
  requestAnimationFrame(() => menu.classList.add("show"));

  menu.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-action]");
    if (!item) return;
    menu.classList.remove("show");
    setTimeout(() => menu.remove(), 260);
    const action = item.dataset.action;
    if (action === "view")   location.hash = "#/set/" + encodeURIComponent(setNum);
    if (action === "edit")   location.hash = "#/set/" + encodeURIComponent(setNum) + "#manage";
    if (action === "remove") {
      if (!id || !confirm("Remove from collection?")) return;
      try {
        await removeFromCollection(id);
        await loadPortfolio({ sort: state.filter.sort, q: state.filter.q });
        paintPortfolio();
        toast("Removed", "success");
      } catch (err) { toast(err.message, "error"); }
    }
  });

  // Dismiss on outside tap
  setTimeout(() => {
    document.addEventListener("touchstart", function dismiss(e) {
      if (!menu.contains(e.target)) {
        menu.classList.remove("show");
        setTimeout(() => menu.remove(), 260);
        document.removeEventListener("touchstart", dismiss);
      }
    }, { passive: true, once: true });
  }, 50);
}

// =============================================================
// Set detail
// =============================================================
async function renderSetDetail(setNum) {
  const root = $("#root");
  root.innerHTML = `
    <div class="page">
      <div class="detail-top">
        <button class="icon-btn" onclick="history.length>1?history.back():(location.hash='#/')">${I.close}</button>
        <div class="icon-row">
          <button class="icon-btn">${I.share}</button>
          <button class="icon-btn">${I.heart}</button>
        </div>
      </div>
      <div class="skel" style="height:300px;margin-top:12px;border-radius:24px"></div>
      <div class="skel line" style="width:62%;margin-top:24px;height:30px"></div>
      <div class="skel line" style="width:38%;margin-top:10px"></div>
      <div class="skel card mt-24"></div>
    </div>
  `;

  let set, entry;
  try {
    const r = await getSet(setNum);
    set = r.set;
    await Promise.all([
      state.portfolio ? Promise.resolve() : loadPortfolio(),
      state.wishlist.length === 0 ? loadWishlist() : Promise.resolve(),
    ]);
    entry = state.portfolio.items.find(i => i.set_num === set.set_num);
  } catch (e) {
    root.innerHTML = `
      <div class="page">${topBar()}
        <div class="empty">
          <h3>Set not found</h3>
          <p>${e.message}</p>
          <a href="#/" class="add-btn">${I.arrowR} Back to portfolio</a>
        </div>
      </div>`;
    return;
  }
  paintSetDetail(set, entry);
}

function paintSetDetail(set, entry) {
  const root = $("#root");
  const qty = entry ? entry.quantity : 0;
  const currentTotal = set.current_value * Math.max(qty, 1);
  const retailDelta = pct(set.current_value, set.retail_price);
  const dSign = retailDelta >= 0 ? "up" : "down";

  const hist = buildHistory(set.set_num, set.retail_price, set.current_value, 30);
  const hasForecast = set.forecast_2y > 0 && set.forecast_5y > 0;
  const fc2pct = hasForecast ? pct(set.forecast_2y, set.current_value) : 0;
  const fc5pct = hasForecast ? pct(set.forecast_5y, set.current_value) : 0;
  const maxGain = hasForecast ? Math.max(set.forecast_5y, set.current_value * 1.5) : set.current_value * 1.5;
  const bar2 = hasForecast ? Math.min(100, ((set.forecast_2y - set.current_value) / (maxGain - set.current_value)) * 100) : 0;
  const bar5 = hasForecast ? Math.min(100, ((set.forecast_5y - set.current_value) / (maxGain - set.current_value)) * 100) : 0;

  const tab = state.detail.tab;
  const panelId = { info: "tabInfo", forecast: "tabForecast", manage: "tabManage" };
  const wishlisted = isWishlisted(set.set_num);

  // Sell-now calculator (shown when item is in collection with a purchase price)
  let sellSection = "";
  if (qty > 0 && entry?.purchase_price) {
    const fee = 0.10;
    const netProceeds = set.current_value * (1 - fee);
    const breakEven = entry.purchase_price / (1 - fee);
    const profitLoss = netProceeds - entry.purchase_price;
    const plSign = profitLoss >= 0 ? "up" : "down";
    let roiLine = "";
    if (entry.purchased_at) {
      const years = (Date.now() - new Date(entry.purchased_at).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (years >= 0.08 && entry.purchase_price > 0) {
        const annRoi = (Math.pow(set.current_value / entry.purchase_price, 1 / years) - 1) * 100;
        const daysHeld = Math.round(years * 365.25);
        roiLine = `
          <div class="sell-row"><span>Held</span><span class="mono">${daysHeld} days</span></div>
          <div class="sell-row ${annRoi >= 0 ? "up" : "down"}">
            <span>Annualized ROI</span>
            <span class="mono">${annRoi >= 0 ? "+" : ""}${annRoi.toFixed(1)}%/yr</span>
          </div>`;
      }
    }
    sellSection = `
      <div class="card tight sell-card">
        <h4>Sell analysis · 10% fee</h4>
        <div class="sell-grid">
          <div class="sell-row"><span>Net after fees</span><span class="mono">${fmtMoney(netProceeds)}</span></div>
          <div class="sell-row ${plSign}"><span>Profit / loss</span><span class="mono">${profitLoss >= 0 ? "+" : ""}${fmtMoney(profitLoss)}</span></div>
          <div class="sell-row"><span>Break-even sell price</span><span class="mono">${fmtMoney(breakEven)}</span></div>
          ${roiLine}
        </div>
      </div>`;
  }

  root.innerHTML = `
    <div class="page no-pad-top">
      <div class="detail-hero">
        <div class="detail-hero-bg" style="background-image:url('${set.image_url}')"></div>
        <div class="detail-top">
          <button class="icon-btn ghost" id="closeBtn" aria-label="Close">${I.close}</button>
          <span class="detail-top-title" id="detailTopTitle">${set.name}</span>
          <div class="icon-row">
            <button class="icon-btn ghost" aria-label="Share">${I.share}</button>
            <button class="icon-btn ghost heart-btn ${wishlisted ? "wishlisted" : ""}" id="wishlistBtn" aria-label="${wishlisted ? "Remove from wishlist" : "Add to wishlist"}">${I.heart}</button>
          </div>
        </div>
        <img src="${set.image_url}" alt="${set.name}" onerror="this.style.opacity=0.1">
        <div class="detail-hero-scrim">
          <h1 class="detail-title">${set.name}</h1>
          <div class="pill-row">
            <span class="pill">${I.tag}<span>#${set.set_num}</span></span>
            ${set.includes_minifigs ? `<span class="pill warm">${I.box}<span>${set.minifigs} minifigs</span></span>` : ""}
            ${set.retired ? `<span class="pill cool">Retired</span>` : ""}
          </div>
        </div>
      </div>

      <div class="detail-tabs">
        <button class="detail-tab ${tab === "info" ? "active" : ""}" data-tab="info">Info</button>
        <button class="detail-tab ${tab === "forecast" ? "active" : ""}" data-tab="forecast">Forecast</button>
        <button class="detail-tab ${tab === "manage" ? "active" : ""}" data-tab="manage">Manage</button>
      </div>
      <div class="tab-dots">
        ${["info", "forecast", "manage"].map(t => `<span class="tab-dot${tab === t ? " active" : ""}"></span>`).join("")}
      </div>

      <div class="detail-tab-panel ${tab === "info" ? "active" : ""}" id="tabInfo">
        <div class="card market-card">
          <div class="hero-label">Market value · ${qty > 1 ? `${qty} units` : "1 unit"}</div>
          <div class="big">${fmtMoney(currentTotal)}</div>
          <div class="row-between mt-8">
            <span class="delta ${dSign}">
              ${dSign === "up" ? I.trend : I.trendDn}
              <span>${retailDelta >= 0 ? "+" : ""}${retailDelta.toFixed(1)}%</span>
              <span style="opacity:.55">vs retail</span>
            </span>
            <span class="font-mono text-sm muted">${fmtMoney(set.retail_price)}</span>
          </div>
          <div class="sparkline-wrap" id="setChart" style="height:72px;margin-top:16px"></div>
        </div>
        <div class="stats-grid">
          <div class="stat"><div class="k">Theme</div><div class="v">${set.theme || "—"}</div></div>
          <div class="stat"><div class="k">Year</div><div class="v mono">${set.year || "—"}</div></div>
          <div class="stat"><div class="k">Pieces</div><div class="v mono">${(set.pieces || 0).toLocaleString()}</div></div>
          <div class="stat"><div class="k">Minifigs</div><div class="v mono">${set.minifigs || 0}</div></div>
        </div>
      </div>

      <div class="detail-tab-panel ${tab === "forecast" ? "active" : ""}" id="tabForecast">
        <div class="card forecast-card">
          <h4>Forecast</h4>
          <div class="subhead">${qty > 0 ? `Your ${qty > 1 ? qty + " × " : ""}${set.name.split(" ").slice(0,3).join(" ")} projected value` : "Projected market value"}</div>
          ${!hasForecast ? `<p class="muted text-sm" style="margin:12px 0">Forecast not yet available for this set.</p>` : `
          <div class="forecast-row year-2">
            <span class="forecast-when">2 yr</span>
            <div class="forecast-bar"><div class="forecast-bar-fill" style="width:${bar2}%"></div></div>
            <span class="forecast-amt">${fmtMoneyShort(qty > 0 ? set.forecast_2y * qty : set.forecast_2y)}</span>
            <span class="forecast-gain">+${fc2pct.toFixed(0)}%</span>
          </div>
          <div class="forecast-row year-5">
            <span class="forecast-when">5 yr</span>
            <div class="forecast-bar"><div class="forecast-bar-fill" style="width:${bar5}%"></div></div>
            <span class="forecast-amt">${fmtMoneyShort(qty > 0 ? set.forecast_5y * qty : set.forecast_5y)}</span>
            <span class="forecast-gain">+${fc5pct.toFixed(0)}%</span>
          </div>
          ${qty > 0 && hasForecast ? `
            <p class="muted text-sm" style="margin:14px 0 0;line-height:1.5">
              Your ${qty > 1 ? qty + " copies" : "copy"} could be worth <strong>${fmtMoney(set.forecast_5y * qty)}</strong> in 5 years.
            </p>` : ""}
          `}
          ${set.description ? `<p class="muted text-sm" style="margin:18px 0 0;line-height:1.5">${set.description}</p>` : ""}
        </div>
      </div>

      <div class="detail-tab-panel ${tab === "manage" ? "active" : ""}" id="tabManage">
        <div class="card qty-card">
          <div class="qty-label">${I.box}<span>${qty > 0 ? "In your collection" : "Add to collection"}</span></div>
          <div class="qty-controls">
            <button class="qty-btn minus" id="qtyMinus" ${qty === 0 ? "disabled" : ""}>−</button>
            <span class="qty-value" id="qtyValue">${qty}</span>
            <button class="qty-btn plus" id="qtyPlus">+</button>
          </div>
        </div>
        ${qty > 0 && entry ? `
          <div class="card tight price-card" id="priceCard">
            <div class="price-card-row">
              <div>
                <div class="manage-label">Purchase price</div>
                <div class="manage-val" id="priceDisplay">
                  ${entry.purchase_price ? fmtMoney(entry.purchase_price) : '<span class="muted">Not set</span>'}
                  ${entry.added_at ? `<span class="price-date">· ${new Date(entry.added_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>` : ""}
                </div>
              </div>
              <button class="icon-btn" id="editPriceBtn" aria-label="Edit price">${I.pencil}</button>
            </div>
            <div id="priceEditWrap" style="display:none;margin-top:10px">
              <input type="number" class="price-input" id="priceInput" placeholder="0.00" step="0.01" min="0" value="${entry.purchase_price || ""}">
              <div class="price-edit-btns">
                <button class="cancel-sm" id="cancelPriceBtn">Cancel</button>
                <button class="save-sm" id="savePriceBtn">Save</button>
              </div>
            </div>
            ${entry.purchase_price ? `
              <div class="pl-row">
                <span class="pl-item">Paid <strong>${fmtMoney(entry.purchase_price)}</strong></span>
                <span class="pl-sep">·</span>
                <span class="pl-item">Now <strong>${fmtMoney(set.current_value)}</strong></span>
                <span class="pl-sep">·</span>
                <span class="pl-item pl-net ${set.current_value >= entry.purchase_price ? "up" : "down"}">Net <strong>${set.current_value - entry.purchase_price >= 0 ? "+" : ""}${fmtMoney(set.current_value - entry.purchase_price)}</strong></span>
              </div>
            ` : ""}
          </div>

          <div class="card tight">
            <div class="manage-label">Purchase date</div>
            <input type="date" class="price-input date-input" id="purchasedAtInput"
              value="${entry.purchased_at ? entry.purchased_at.split("T")[0] : ""}"
              style="width:100%;margin-top:8px">
          </div>

          <div class="card tight">
            <div class="manage-label">Condition</div>
            <select class="condition-sel" id="conditionSel">
              <option value="">Not specified</option>
              <option value="new"             ${entry.condition === "new"             ? "selected" : ""}>New</option>
              <option value="sealed"          ${entry.condition === "sealed"          ? "selected" : ""}>Sealed (MISB)</option>
              <option value="used_good"       ${entry.condition === "used_good"       ? "selected" : ""}>Used — Good</option>
              <option value="used_acceptable" ${entry.condition === "used_acceptable" ? "selected" : ""}>Used — Acceptable</option>
            </select>
          </div>

          <div class="card tight">
            <div class="manage-label">Notes</div>
            <textarea class="notes-ta" id="notesTa" rows="3" placeholder="Any notes about this set…">${entry.notes || ""}</textarea>
          </div>
        ` : ""}
        ${qty > 0 ? `<button class="danger-btn" id="removeBtn">Remove from collection</button>` : ""}
        ${sellSection}
      </div>
    </div>
  `;

  // Render chart if info tab is active
  if (tab === "info") {
    renderChart($("#setChart"), hist, {
      h: 64, stroke: dSign === "up" ? "#2F6D43" : "#A53224",
      dot: true, scrubLabelFor: (v) => fmtMoneyShort(v),
    });
  }
  if (tab === "forecast") { window._currentSet = set; maybePaintForecastChart && maybePaintForecastChart(); }

  // Tab switching
  $$(".detail-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.detail.tab = btn.dataset.tab;
      $$(".detail-tab").forEach(t => t.classList.toggle("active", t === btn));
      $$(".detail-tab-panel").forEach(p => p.classList.toggle("active", p.id === panelId[btn.dataset.tab]));
      if (state.detail.tab === "info" && !$("#setChart")?.children.length) {
        renderChart($("#setChart"), hist, {
          h: 64, stroke: dSign === "up" ? "#2F6D43" : "#A53224",
          dot: true, scrubLabelFor: (v) => fmtMoneyShort(v),
        });
      }
    });
  });

  // Sticky title: fade in after scrolling past hero
  const detailTopTitle = $("#detailTopTitle");
  function onDetailScroll() {
    const hero = $(".detail-hero");
    if (!hero) { window.removeEventListener("scroll", onDetailScroll); return; }
    const past = window.scrollY > hero.offsetTop + hero.offsetHeight - 60;
    detailTopTitle?.classList.toggle("show", past);
  }
  window.addEventListener("scroll", onDetailScroll, { passive: true });

  $("#closeBtn").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.hash = "#/";
  });

  $("#qtyPlus")?.addEventListener("click", async () => {
    const plusBtn = $("#qtyPlus");
    const qtyDisplay = $("#qtyValue");
    // Optimistic update
    const newQty = qty + 1;
    if (qtyDisplay) qtyDisplay.textContent = newQty;
    if (plusBtn) { plusBtn.disabled = true; plusBtn.setAttribute("aria-busy", "true"); }
    try {
      await addToCollection(set.set_num, newQty);
      await loadPortfolio();
      paintSetDetail(set, state.portfolio.items.find(i => i.set_num === set.set_num));
      if (qty === 0) toast("Added to collection", "success");
    } catch (e) {
      if (qtyDisplay) qtyDisplay.textContent = qty; // rollback
      toast(e.message, "error");
    } finally {
      if (plusBtn) { plusBtn.disabled = false; plusBtn.removeAttribute("aria-busy"); }
    }
  });
  $("#qtyMinus")?.addEventListener("click", async () => {
    if (qty <= 0) return;
    const minusBtn = $("#qtyMinus");
    const qtyDisplay = $("#qtyValue");
    const newQty = qty - 1;
    if (qtyDisplay) qtyDisplay.textContent = newQty;
    if (minusBtn) { minusBtn.disabled = true; minusBtn.setAttribute("aria-busy", "true"); }
    try {
      if (newQty === 0) await removeFromCollection(entry.id);
      else await addToCollection(set.set_num, newQty);
      await loadPortfolio();
      const next = state.portfolio.items.find(i => i.set_num === set.set_num);
      paintSetDetail(set, next);
    } catch (e) {
      if (qtyDisplay) qtyDisplay.textContent = qty; // rollback
      toast(e.message, "error");
    } finally {
      if (minusBtn) { minusBtn.disabled = false; minusBtn.removeAttribute("aria-busy"); }
    }
  });
  $("#removeBtn")?.addEventListener("click", async () => {
    if (!entry) return;
    if (!confirm("Remove this set from your collection?")) return;
    try {
      await removeFromCollection(entry.id);
      await loadPortfolio();
      toast("Removed from collection", "success");
      location.hash = "#/";
    } catch (e) { toast(e.message, "error"); }
  });

  // Share button
  $$(".detail-top .icon-btn[aria-label='Share']").forEach(btn => {
    btn.addEventListener("click", () => shareSet(set, entry));
  });

  // Wishlist toggle
  $("#wishlistBtn")?.addEventListener("click", async () => {
    try {
      const btn = $("#wishlistBtn");
      if (isWishlisted(set.set_num)) {
        const w = wishlistEntryFor(set.set_num);
        if (w) await api("/wishlist/" + w.id, { method: "DELETE" });
        state.wishlist = state.wishlist.filter(x => x.set_num !== set.set_num);
        btn.classList.remove("wishlisted");
        btn.setAttribute("aria-label", "Add to wishlist");
        toast("Removed from wishlist");
      } else {
        const targetPrice = await showWishlistPriceSheet(set);
        const r = await api("/wishlist", { method: "POST", body: { set_num: set.set_num, target_price: targetPrice || null } });
        state.wishlist.push({ ...r.entry, set_num: set.set_num });
        btn.classList.add("wishlisted");
        btn.setAttribute("aria-label", "Remove from wishlist");
        toast("Added to wishlist", "success");
      }
    } catch (e) { toast(e.message, "error"); }
  });

  // Edit purchase price
  $("#editPriceBtn")?.addEventListener("click", () => {
    $("#priceEditWrap").style.display = "block";
    $("#editPriceBtn").style.display  = "none";
    $("#priceInput")?.focus();
  });
  $("#cancelPriceBtn")?.addEventListener("click", () => {
    $("#priceEditWrap").style.display = "none";
    $("#editPriceBtn").style.display  = "";
  });
  $("#savePriceBtn")?.addEventListener("click", async () => {
    const val = parseFloat($("#priceInput")?.value);
    if (isNaN(val) || val < 0) { toast("Enter a valid price", "error"); return; }
    try {
      await api("/collection/" + entry.id, { method: "PATCH", body: { purchase_price: val } });
      await loadPortfolio();
      const updated = state.portfolio.items.find(i => i.set_num === set.set_num);
      paintSetDetail(set, updated);
      toast("Price updated", "success");
    } catch (e) { toast(e.message, "error"); }
  });

  $("#conditionSel")?.addEventListener("change", async (e) => {
    if (!entry) return;
    const condition = e.target.value;
    try {
      await api("/collection/" + entry.id, { method: "PATCH", body: { condition } });
      entry.condition = condition;
      toast("Condition saved", "success");
    } catch (err) { toast(err.message, "error"); }
  });

  let notesTimer;
  $("#notesTa")?.addEventListener("input", () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(async () => {
      if (!entry) return;
      const notes = $("#notesTa").value;
      try {
        await api("/collection/" + entry.id, { method: "PATCH", body: { notes } });
        entry.notes = notes;
      } catch (err) { toast(err.message, "error"); }
    }, 800);
  });

  $("#purchasedAtInput")?.addEventListener("change", async (e) => {
    if (!entry) return;
    const val = e.target.value;
    try {
      await api("/collection/" + entry.id, { method: "PATCH", body: { purchased_at: val || null } });
      entry.purchased_at = val || null;
      toast("Date saved", "success");
    } catch (err) { toast(err.message, "error"); }
  });

  // Swipe left/right to switch detail tabs
  (function () {
    const TABS = ["info", "forecast", "manage"];
    let tx = 0, ty = 0;
    const panels = $(".detail-tabs")?.closest(".page") || root.querySelector(".page");
    if (!panels) return;
    panels.addEventListener("touchstart", (e) => {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
    }, { passive: true });
    panels.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - tx;
      const dy = Math.abs(e.changedTouches[0].clientY - ty);
      if (Math.abs(dx) < 60 || Math.abs(dx) < dy) return;
      const cur = TABS.indexOf(state.detail.tab);
      const next = dx < 0 ? Math.min(cur + 1, TABS.length - 1) : Math.max(cur - 1, 0);
      if (next === cur) return;
      haptic("light");
      state.detail.tab = TABS[next];
      $$(".detail-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === state.detail.tab));
      const panelId = { info: "tabInfo", forecast: "tabForecast", manage: "tabManage" };
      $$(".detail-tab-panel").forEach(p => p.classList.toggle("active", p.id === panelId[state.detail.tab]));
      if (state.detail.tab === "info" && !$("#setChart")?.children.length) {
        renderChart($("#setChart"), hist, {
          h: 64, stroke: dSign === "up" ? "#2F6D43" : "#A53224",
          dot: true, scrubLabelFor: (v) => fmtMoneyShort(v),
        });
      }
    }, { passive: true });
  })();
}

// =============================================================
// Catalog / Add
// =============================================================
async function renderAdd() {
  const root = $("#root");
  root.innerHTML = `
    <div class="page">
      ${topBar({ search: false })}
      <div class="eyebrow mb-8">Catalog</div>
      <h1 class="h-display mb-24">Add a set</h1>

      <button class="scan-pill mb-16" id="scanCta">
        ${I.scan}
        <span>Scan a barcode</span>
      </button>

      <div class="search-wrap mb-12">
        ${I.search}
        <input class="search-input" id="searchInput" placeholder="Search name or set #" autocomplete="off" inputmode="search">
        <button class="search-clear" id="searchClear" style="display:none" aria-label="Clear">${I.close}</button>
      </div>

      <div class="filter-row" style="flex-wrap:wrap;gap:6px 4px">
        <select class="sort-pill" id="catalogSortSel" aria-label="Sort catalog">
          <option value="value_desc" ${state.filter.catalogSort === "value_desc" ? "selected" : ""}>Value ↓</option>
          <option value="value_asc"  ${state.filter.catalogSort === "value_asc"  ? "selected" : ""}>Value ↑</option>
          <option value="year_desc"  ${state.filter.catalogSort === "year_desc"  ? "selected" : ""}>Newest</option>
          <option value="year_asc"   ${state.filter.catalogSort === "year_asc"   ? "selected" : ""}>Oldest</option>
          <option value="name_asc"   ${state.filter.catalogSort === "name_asc"   ? "selected" : ""}>A–Z</option>
          <option value="pieces_desc" ${state.filter.catalogSort === "pieces_desc" ? "selected" : ""}>Most pieces</option>
        </select>
        <button class="chip ${state.filter.catalogYear === "all"   ? "active" : ""}" data-year="all">All years</button>
        <button class="chip ${state.filter.catalogYear === "2020s" ? "active" : ""}" data-year="2020s">2020s</button>
        <button class="chip ${state.filter.catalogYear === "2010s" ? "active" : ""}" data-year="2010s">2010s</button>
        <button class="chip ${state.filter.catalogYear === "pre2010" ? "active" : ""}" data-year="pre2010">Pre-2010</button>
        <button class="chip ${state.filter.catalogRetired ? "active" : ""}" id="retiredChip">Retired</button>
      </div>

      <div class="filter-row" id="themeChips">
        <button class="chip ${state.filter.theme === null ? "active" : ""}" data-theme="">All themes</button>
      </div>

      <div id="results"></div>
    </div>
  `;

  $("#scanCta").addEventListener("click", openScan);

  if (state.themes.length === 0 || Date.now() - state.themesLoadedAt > 5 * 60_000) {
    try { await loadThemes(); state.themesLoadedAt = Date.now(); } catch (e) { /* non-fatal */ }
  }
  const chips = $("#themeChips");
  state.themes.slice(0, 14).forEach(t => {
    const btn = document.createElement("button");
    btn.className = "chip" + (state.filter.theme === t.theme ? " active" : "");
    btn.dataset.theme = t.theme;
    btn.innerHTML = `${t.theme}<span class="count">${t.n}</span>`;
    btn.addEventListener("click", async () => {
      state.filter.theme = state.filter.theme === t.theme ? null : t.theme;
      state.catalog = null;
      state.catalogPage = 1;
      renderAdd();
    });
    chips.appendChild(btn);
  });
  // wire the "All themes" chip
  const allChip = chips.querySelector('[data-theme=""]');
  if (allChip && !allChip.dataset.bound) {
    allChip.dataset.bound = "1";
    allChip.addEventListener("click", async () => {
      state.filter.theme = null;
      state.catalog = null;
      state.catalogPage = 1;
      renderAdd();
    });
  }

  // wire catalog sort
  const catalogSortSel = $("#catalogSortSel");
  if (catalogSortSel) {
    catalogSortSel.addEventListener("change", () => {
      state.filter.catalogSort = catalogSortSel.value;
      state.catalogPage = 1;
      paintCatalogResults();
    });
  }

  // wire year filter chips
  $$("#themeChips [data-year], .filter-row [data-year]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter.catalogYear = btn.dataset.year;
      state.catalogPage = 1;
      // re-render year chips active state
      $$(".filter-row [data-year]").forEach(b => b.classList.toggle("active", b.dataset.year === state.filter.catalogYear));
      paintCatalogResults();
    });
  });

  // wire retired toggle
  const retiredChip = $("#retiredChip");
  if (retiredChip) {
    retiredChip.addEventListener("click", () => {
      state.filter.catalogRetired = !state.filter.catalogRetired;
      retiredChip.classList.toggle("active", state.filter.catalogRetired);
      state.catalogPage = 1;
      paintCatalogResults();
    });
  }

  if (!state.catalog) {
    $("#results").innerHTML = `
      <div class="skel card" style="height:88px;margin-bottom:8px"></div>
      <div class="skel card" style="height:88px;margin-bottom:8px"></div>
      <div class="skel card" style="height:88px"></div>
    `;
    try { await loadCatalog("", state.filter.theme); } catch (e) {}
  }
  paintCatalogResults();

  const input = $("#searchInput");
  const clearBtn = $("#searchClear");
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    if (clearBtn) clearBtn.style.display = input.value ? "flex" : "none";
    const q = input.value.trim();
    if (q === "") {
      // immediate clear
      $("#results").innerHTML = `<div class="loading-more"><span class="spinner"></span>Loading…</div>`;
      loadCatalog("", state.filter.theme).then(paintCatalogResults).catch(() => {});
      return;
    }
    $("#results").innerHTML = `<div class="loading-more"><span class="spinner"></span>Searching ${state.themes.length > 0 ? "the LEGO catalog" : "your sets"}…</div>`;
    timer = setTimeout(async () => {
      try { await loadCatalog(q, state.filter.theme); paintCatalogResults(); }
      catch (e) { toast(e.message, "error"); }
    }, 280);
  });
  clearBtn?.addEventListener("click", () => {
    input.value = "";
    clearBtn.style.display = "none";
    input.focus();
    state.catalogPage = 1;
    $("#results").innerHTML = `<div class="loading-more"><span class="spinner"></span>Loading…</div>`;
    loadCatalog("", state.filter.theme).then(paintCatalogResults).catch(() => {});
  });
}

function applyCatalogFilters(sets) {
  let result = sets.slice();
  if (state.filter.catalogYear !== "all") {
    result = result.filter(s => {
      const y = s.year;
      if (!y) return true; // unknown year: include in all filters
      if (state.filter.catalogYear === "2020s")   return y >= 2020;
      if (state.filter.catalogYear === "2010s")   return y >= 2010 && y < 2020;
      if (state.filter.catalogYear === "pre2010") return y < 2010;
      return true;
    });
  }
  if (state.filter.catalogRetired) {
    result = result.filter(s => s.retired);
  }
  const sort = state.filter.catalogSort;
  result.sort((a, b) => {
    if (sort === "value_desc")  return (b.current_value || 0) - (a.current_value || 0);
    if (sort === "value_asc")   return (a.current_value || 0) - (b.current_value || 0);
    if (sort === "year_desc")   return (b.year || 0) - (a.year || 0);
    if (sort === "year_asc")    return (a.year || 0) - (b.year || 0);
    if (sort === "name_asc")    return (a.name || "").localeCompare(b.name || "");
    if (sort === "pieces_desc") return (b.pieces || 0) - (a.pieces || 0);
    return 0;
  });
  return result;
}

function paintCatalogResults() {
  const wrap = $("#results");
  if (!wrap) return;

  const ownedSet = new Set((state.portfolio?.items || []).map(i => i.set_num));
  const wishlistMap = new Map((state.wishlist || []).map(w => [w.set_num, w]));
  const filtered = applyCatalogFilters(state.catalogAll || []);
  const pageSize = state.catalogPageSize;
  const visible = filtered.slice(0, state.catalogPage * pageSize);
  const hasMore = visible.length < filtered.length;

  if (filtered.length === 0) {
    wrap.innerHTML = `
      <div class="empty">
        <h3>No matches</h3>
        <p>Try a different keyword, theme, or scan the box.</p>
      </div>`;
    return;
  }

  const incomplete = state.catalog?.search_incomplete;

  function cardHTML(s) {
    const owned = ownedSet.has(s.set_num);
    const wl = wishlistMap.get(s.set_num);
    let gapBadge = "";
    if (wl && wl.target_price && s.current_value) {
      const gap = (s.current_value - wl.target_price) / wl.target_price * 100;
      gapBadge = gap <= 0
        ? `<span class="wl-gap-badge at-target">At target!</span>`
        : `<span class="wl-gap-badge">${gap.toFixed(0)}% to target</span>`;
    }
    return `
      <div class="add-result ${owned ? "owned" : ""}" data-set="${encodeURIComponent(s.set_num)}">
        <div class="add-result-img">
          <img src="${s.image_url}" alt="${s.name}" loading="lazy" onerror="this.style.opacity=0.12">
          ${owned ? `<span class="owned-badge">${I.check}</span>` : ""}
        </div>
        <div class="add-result-body">
          <div class="add-result-name">${s.name}</div>
          <div class="add-result-meta">#${s.set_num}${s.theme ? " · " + s.theme : ""}${s.year ? " · " + s.year : ""}</div>
          <div class="add-result-foot">
            <span class="add-result-price">${fmtMoney(s.current_value || 0)}</span>
            ${gapBadge}
            <button class="add-result-btn ${owned ? "owned" : ""}" data-action="${owned ? "view" : "add"}" aria-label="${owned ? "Owned" : "Add"}">
              ${owned ? I.check : I.plus}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function wireCards(grid) {
    grid.querySelectorAll(".add-result").forEach(el => {
      el.addEventListener("click", async (e) => {
        const setNum = decodeURIComponent(el.dataset.set);
        const btn = e.target.closest(".add-result-btn");
        if (btn && btn.dataset.action === "add") { e.stopPropagation(); await addQuick(setNum, el); return; }
        location.hash = "#/set/" + encodeURIComponent(setNum);
      });
    });
  }

  const activeFilters = [];
  if (state.filter.catalogYear && state.filter.catalogYear !== "all") {
    activeFilters.push({ label: `Year: ${state.filter.catalogYear}`, key: "catalogYear" });
  }
  if (state.filter.catalogRetired) {
    activeFilters.push({ label: "Retired only", key: "catalogRetired" });
  }
  const activeFiltersHTML = activeFilters.length > 0
    ? `<div class="active-filters-row">${activeFilters.map(f =>
        `<span class="active-filter-chip" data-filter-key="${f.key}">${f.label} ×</span>`
      ).join("")}</div>`
    : "";

  wrap.innerHTML = `
    ${incomplete ? `<div class="search-incomplete-banner">⚠ Live catalog search unavailable — showing local results only.</div>` : ""}
    ${activeFiltersHTML}
    <div class="results-count">${filtered.length} set${filtered.length !== 1 ? "s" : ""}</div>
    <div class="results-grid" id="catalogGrid">
      ${visible.map(cardHTML).join("")}
    </div>
    ${hasMore ? `<div id="catalogSentinel" class="loading-more"><span class="spinner"></span></div>` : ""}
  `;

  wrap.querySelectorAll(".active-filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.filterKey;
      if (key === "catalogYear") { state.filter.catalogYear = "all"; const sel = document.getElementById("yearSelect"); if (sel) sel.value = "all"; }
      if (key === "catalogRetired") { state.filter.catalogRetired = false; const btn = document.getElementById("retiredChip"); if (btn) btn.classList.remove("active"); }
      state.catalogPage = 1;
      paintCatalogResults();
    });
  });

  const grid = $("#catalogGrid");
  if (grid) wireCards(grid);

  const sentinel = $("#catalogSentinel");
  if (sentinel) {
    const obs = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      state.catalogPage++;
      const newFiltered = applyCatalogFilters(state.catalogAll || []);
      const newVisible = newFiltered.slice(0, state.catalogPage * pageSize);
      const newCards = newFiltered.slice(visible.length, state.catalogPage * pageSize);
      sentinel.remove();
      const g = $("#catalogGrid");
      if (g) {
        newCards.forEach(s => {
          const tmp = document.createElement("div");
          tmp.innerHTML = cardHTML(s).trim();
          g.appendChild(tmp.firstElementChild);
        });
        wireCards(g);
      }
      if (newVisible.length < newFiltered.length) {
        const s2 = document.createElement("div");
        s2.id = "catalogSentinel";
        s2.className = "loading-more";
        s2.innerHTML = `<span class="spinner"></span>`;
        wrap.appendChild(s2);
        const obs2 = new IntersectionObserver((e2) => {
          if (!e2[0].isIntersecting) return;
          obs2.disconnect();
          state.catalogPage++;
          paintCatalogResults();
        }, { rootMargin: "200px" });
        obs2.observe(s2);
      }
    }, { rootMargin: "200px" });
    obs.observe(sentinel);
  }
}

async function addQuick(setNum, rowEl) {
  try {
    await addToCollection(setNum, 1);
    await loadPortfolio();
    rowEl.classList.add("owned");
    const btn = rowEl.querySelector(".add-result-btn");
    if (btn) {
      btn.innerHTML = I.check;
      btn.dataset.action = "view";
      btn.classList.add("owned");
    }
    const imgWrap = rowEl.querySelector(".add-result-img");
    if (imgWrap && !imgWrap.querySelector(".owned-badge")) {
      const badge = document.createElement("span");
      badge.className = "owned-badge";
      badge.innerHTML = I.check;
      imgWrap.appendChild(badge);
    }
    toast("Added to collection", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}

// =============================================================
// Pile Scanner page
// =============================================================
function renderPile() {
  $("#root").innerHTML = `
    <div class="page">
      ${topBar()}
      <div class="eyebrow mb-8">Identify</div>
      <h1 class="h-display mb-16">Pile Scanner</h1>

      <div class="scan-cta" id="scanCta">
        <div class="label">GPT-4o Vision</div>
        <h2>Photograph a set</h2>
        <p>Point your camera at a LEGO box, built model, or instruction cover — AI identifies it instantly.</p>
        <div class="arrow">${I.scan}</div>
      </div>

      <div class="pile-tips">
        <div class="pile-tip"><span class="tip-dot"></span>Works on box art, built models, and instructions</div>
        <div class="pile-tip"><span class="tip-dot"></span>No barcode needed — visual ID from any angle</div>
        <div class="pile-tip"><span class="tip-dot"></span>After ID, add to your collection in one tap</div>
      </div>

      <div class="list-card">
        <button class="list-row" id="scanBarcodeBtn">
          <span class="icon-wrap">${I.scan}</span>
          <div class="text">
            <h4>Barcode scan</h4>
            <p>Auto-detect UPC / EAN barcodes from the box</p>
          </div>
          <span class="chev">${I.chev}</span>
        </button>
        <a class="list-row" href="#/add">
          <span class="icon-wrap">${I.search}</span>
          <div class="text">
            <h4>Search catalog</h4>
            <p>Browse or search by name, number, or theme</p>
          </div>
          <span class="chev">${I.chev}</span>
        </a>
      </div>
    </div>
  `;
  // Photo mode scan
  $("#scanCta").addEventListener("click", () => {
    state.camera.mode = "photo";
    openScan();
  });
  // Barcode mode scan
  document.getElementById("scanBarcodeBtn")?.addEventListener("click", () => {
    state.camera.mode = "barcode";
    openScan();
  });
}

// =============================================================
// Blind Bag page
// =============================================================
const BLIND_SAMPLE = [
  { name: "Mr. Gold",           series: "Minifigures",   rarity: "legendary", value: 1450, image_url: "https://images.brickset.com/sets/large/col325-1.jpg" },
  { name: "Boba Fett",          series: "Star Wars",     rarity: "rare",      value: 48,   image_url: "https://images.brickset.com/sets/large/sw0908-1.jpg" },
  { name: "Mariachi",           series: "Minifigures",   rarity: "uncommon",  value: 8.5,  image_url: "https://images.brickset.com/sets/large/col265-1.jpg" },
  { name: "Golden Master Wu",   series: "Ninjago",       rarity: "rare",      value: 32,   image_url: "https://images.brickset.com/sets/large/njo493-1.jpg" },
  { name: "Gingerbread Man",    series: "Minifigures",   rarity: "uncommon",  value: 12,   image_url: "https://images.brickset.com/sets/large/col359-1.jpg" },
  { name: "Hermione Granger",   series: "Harry Potter",  rarity: "rare",      value: 22,   image_url: "https://images.brickset.com/sets/large/hp110-1.jpg" },
  { name: "Viking",             series: "Minifigures",   rarity: "common",    value: 6,    image_url: "https://images.brickset.com/sets/large/col050-1.jpg" },
  { name: "Space Police",       series: "Minifigures",   rarity: "common",    value: 5,    image_url: "https://images.brickset.com/sets/large/col080-1.jpg" },
  { name: "Cole (Dragon)",      series: "Ninjago",       rarity: "uncommon",  value: 14,   image_url: "https://images.brickset.com/sets/large/njo388-1.jpg" },
  { name: "Han Solo",           series: "Star Wars",     rarity: "uncommon",  value: 18,   image_url: "https://images.brickset.com/sets/large/sw0557-1.jpg" },
  { name: "Clockwork Robot",    series: "Minifigures",   rarity: "rare",      value: 38,   image_url: "https://images.brickset.com/sets/large/col176-1.jpg" },
  { name: "Yoda",               series: "Star Wars",     rarity: "rare",      value: 55,   image_url: "https://images.brickset.com/sets/large/sw1113-1.jpg" },
];

async function renderBlind() {
  const root = $("#root");
  root.innerHTML = `
    <div class="page">
      ${topBar()}
      <div class="eyebrow mb-8">Identify</div>
      <h1 class="h-display mb-24">Blind Bag</h1>
      <div class="scan-cta" id="scanCta">
        <div class="label">Feel · scan · ID</div>
        <h2>Identify a blind bag</h2>
        <p>Squeeze the bag, hold it up to the camera. We guess what's inside.</p>
        <div class="arrow">${I.scan}</div>
      </div>
      <div class="filter-row" id="blindFilterRow">
        <button class="chip active" data-series="">All series</button>
      </div>
      <div id="blindGrid">
        <div class="skel card" style="height:100px;margin-bottom:8px"></div>
        <div class="skel card" style="height:100px;margin-bottom:8px"></div>
        <div class="skel card" style="height:100px"></div>
      </div>
    </div>
  `;
  $("#scanCta").addEventListener("click", openScan);

  let allFigs = [];
  let activeSeries = "";

  function paintFigs(figs) {
    const grid = $("#blindGrid");
    if (!grid) return;
    if (figs.length === 0) {
      grid.innerHTML = `<div class="empty"><h3>No minifigs yet</h3><p>Import the catalog in <a href="/settings.html">Settings</a> to populate.</p></div>`;
      return;
    }
    grid.innerHTML = `<div class="grid">${figs.map(f => `
      <div class="fig-card fig-${f.rarity}">
        <span class="rarity rarity-${f.rarity}">${f.rarity}</span>
        <div class="fig-img-wrap">
          <img src="${f.image_url}" alt="${f.name}" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='flex')">
          <span class="fig-img-placeholder">🧱</span>
        </div>
        <div class="name">${f.name}</div>
        <div class="muted text-xs mb-4">${f.series}</div>
        <div class="value">${fmtMoney(f.value)}</div>
      </div>
    `).join("")}</div>`;
  }

  try {
    const r = await api("/minifigs?limit=60");
    allFigs = r.minifigs || [];

    // Populate series chips
    const filterRow = $("#blindFilterRow");
    if (filterRow && r.series && r.series.length > 1) {
      r.series.slice(0, 8).forEach(s => {
        const btn = document.createElement("button");
        btn.className = "chip";
        btn.dataset.series = s;
        btn.textContent = s;
        filterRow.appendChild(btn);
      });
    }

    // Use seeded data if DB is empty
    if (allFigs.length === 0) allFigs = BLIND_SAMPLE;
    paintFigs(allFigs);

    $("#blindFilterRow")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-series]");
      if (!chip) return;
      activeSeries = chip.dataset.series;
      $$("[data-series]", $("#blindFilterRow")).forEach(c => c.classList.toggle("active", c === chip));
      const filtered = activeSeries ? allFigs.filter(f => f.series === activeSeries) : allFigs;
      paintFigs(filtered);
    });
  } catch (e) {
    // Fallback to sample data
    allFigs = BLIND_SAMPLE;
    paintFigs(allFigs);
  }
}

// =============================================================
// Camera scan — real implementation
// =============================================================
async function openScan() {
  const overlay = $("#scanOverlay");
  overlay.classList.add("show");
  setupScanModeToggle();
  // If permission not already granted, show pre-permission dialog first
  try {
    const perm = await navigator.permissions?.query({ name: "camera" }).catch(() => null);
    if (perm && perm.state === "prompt") {
      await showCameraPermissionDialog();
    }
  } catch {}
  await startCamera();
}

function showCameraPermissionDialog() {
  return new Promise(resolve => {
    const existing = $("#cameraPermDialog");
    if (existing) { existing.remove(); }
    const dlg = document.createElement("div");
    dlg.id = "cameraPermDialog";
    dlg.className = "cam-perm-dialog";
    dlg.innerHTML = `
      <div class="cam-perm-inner">
        <div class="cam-perm-icon">📷</div>
        <h3>Camera access needed</h3>
        <p>Brickvault uses your camera to scan barcodes and identify LEGO sets from photos.</p>
        <button class="primary-btn" id="camPermAllow">Allow camera</button>
        <button class="cancel-sm" id="camPermDeny" style="margin-top:8px;width:100%">Not now</button>
      </div>
    `;
    document.getElementById("scanOverlay").appendChild(dlg);
    document.getElementById("camPermAllow").addEventListener("click", () => {
      dlg.remove();
      resolve();
    });
    document.getElementById("camPermDeny").addEventListener("click", () => {
      dlg.remove();
      closeScan();
      resolve();
    });
  });
}

function setupScanModeToggle() {
  const toggle = $("#scanModeToggle");
  $$("button", toggle).forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === state.camera.mode);
    btn.onclick = () => {
      state.camera.mode = btn.dataset.mode;
      $$("button", toggle).forEach(b =>
        b.classList.toggle("active", b.dataset.mode === state.camera.mode));
      applyScanMode();
    };
  });
  applyScanMode();
}

function applyScanMode() {
  const isPhoto = state.camera.mode === "photo";
  $("#scanCapture").style.display = isPhoto ? "flex" : "none";
  $("#scanHint").textContent  = isPhoto ? "Point at the set" : "Point at a barcode";
  $("#scanSub").textContent   = isPhoto
    ? "Tap the shutter to identify with GPT-4o vision"
    : (("BarcodeDetector" in window)
        ? "Auto-detects most UPC and EAN codes"
        : "Or switch to Photo mode — your browser doesn't support live barcode reading");
  $("#scanTitle").textContent = isPhoto ? "Photo scan" : "Barcode scan";

  if (isPhoto) {
    stopBarcodeLoop();
  } else {
    if ("BarcodeDetector" in window) startBarcodeLoop();
  }
}

async function startCamera() {
  if (state.camera.stream) return;
  const video = $("#scanVideo");
  try {
    state.camera.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = state.camera.stream;
    await video.play().catch(() => {});
    if ("BarcodeDetector" in window) {
      try {
        state.camera.detector = new BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
        });
      } catch {
        state.camera.detector = null;
      }
    }
    if (state.camera.mode === "barcode") startBarcodeLoop();
  } catch (e) {
    // permission denied or no camera — show fallback
    $("#scanHint").textContent = "Couldn't open the camera";
    $("#scanSub").textContent  = e.message || "Permission denied";
    $("#scanCapture").style.display = "none";
  }
}

function stopCamera() {
  if (state.camera.stream) {
    state.camera.stream.getTracks().forEach(t => t.stop());
    state.camera.stream = null;
  }
  $("#scanVideo").srcObject = null;
  stopBarcodeLoop();
}

function startBarcodeLoop() {
  stopBarcodeLoop();
  if (!state.camera.detector) return;
  state.camera.scanning = true;
  const video = $("#scanVideo");
  state.camera.timer = setInterval(async () => {
    if (!state.camera.scanning || !video.videoWidth) return;
    try {
      const codes = await state.camera.detector.detect(video);
      if (codes.length) {
        state.camera.scanning = false;
        const code = codes[0].rawValue;
        flash();
        await onBarcode(code);
        state.camera.scanning = true;
      }
    } catch {
      /* detection error — ignore, try again */
    }
  }, 600);
}

function stopBarcodeLoop() {
  state.camera.scanning = false;
  if (state.camera.timer) {
    clearInterval(state.camera.timer);
    state.camera.timer = null;
  }
}

function flash() {
  const f = $("#scanFlash");
  f.classList.remove("fire");
  void f.offsetWidth;            // restart animation
  f.classList.add("fire");
}

function showScanResultCard(set) {
  const overlay = document.getElementById("scanOverlay");
  const existing = document.getElementById("scanResultCard");
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.id = "scanResultCard";
  card.className = "scan-result-card";
  card.innerHTML = `
    <div class="src-img">
      <img src="${set.image_url || ""}" alt="${set.name}" onerror="this.style.opacity=0.2">
    </div>
    <div class="src-body">
      <div class="src-name">${set.name}</div>
      <div class="src-meta">#${set.set_num}${set.theme ? " · " + set.theme : ""}</div>
      <div class="src-price">${fmtMoney(set.current_value || 0)}</div>
    </div>
    <div class="src-actions">
      <button class="src-btn-add" id="srcAddBtn">Add to collection</button>
      <button class="src-btn-view" id="srcViewBtn">View details</button>
    </div>
  `;
  overlay.appendChild(card);
  // animate in
  requestAnimationFrame(() => card.classList.add("visible"));

  document.getElementById("srcAddBtn").addEventListener("click", async () => {
    try {
      await addToCollection(set.set_num, 1);
      await loadPortfolio();
      toast("Added to collection", "success");
    } catch (e) { toast(e.message, "error"); }
    closeScan();
  });
  document.getElementById("srcViewBtn").addEventListener("click", () => {
    closeScan();
    location.hash = "#/set/" + encodeURIComponent(set.set_num);
  });
}

async function onBarcode(code) {
  $("#scanHint").textContent = "Looking up barcode…";
  try {
    const r = await scanIdentify({ mode: "barcode", barcode: code });
    if (r.identified && r.set) {
      flash();
      showScanResultCard(r.set);
      return;
    }
    // barcode didn't resolve — offer photo mode and text search fallback
    $("#scanHint").textContent = "Barcode not in catalog";
    const sub = $("#scanSub");
    if (sub) {
      sub.textContent = "";
      sub.innerHTML = `Switch to Photo mode to ID the box, or <button class="scan-text-link" id="barcodeSearchBtn">search by name →</button>`;
      document.getElementById("barcodeSearchBtn")?.addEventListener("click", () => {
        closeScan();
        location.hash = "#/add";
      });
    }
  } catch (e) {
    $("#scanHint").textContent = "Lookup failed";
    $("#scanSub").textContent  = e.message;
  }
}

async function capturePhoto() {
  const video = $("#scanVideo");
  if (!video.videoWidth) return;

  // Downscale to keep upload reasonable
  const target = 1024;
  const ratio = video.videoWidth / video.videoHeight;
  const w = Math.min(target, video.videoWidth);
  const h = Math.round(w / ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

  // Show preview and wait for confirm / retake
  return showPhotoPreview(dataUrl, video);
}

async function sendPhotoToAPI(dataUrl) {
  $("#scanHint").textContent = "Identifying…";
  $("#scanSub").textContent  = "GPT-4o is looking at your photo";
  $("#scanCapture").style.opacity = "0.4";
  $("#scanCapture").style.pointerEvents = "none";

  try {
    const r = await scanIdentify({ mode: "image", image: dataUrl });
    if (r.identified && r.set) {
      flash();
      showScanResultCard(r.set);
      return;
    }
    if (r.identified && r.suggestion) {
      flash();
      showScanResultCard(r.suggestion);
      return;
    }
    $("#scanHint").textContent = "Couldn't identify";
    $("#scanSub").textContent  = r.reasoning || "Try a clearer angle or more lighting";
  } catch (e) {
    $("#scanHint").textContent = "Identification failed";
    $("#scanSub").textContent  = e.message;
  } finally {
    $("#scanCapture").style.opacity = "1";
    $("#scanCapture").style.pointerEvents = "auto";
  }
}

function showPhotoPreview(dataUrl, video) {
  // Remove any existing preview
  $("#photoPreviewOverlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "photoPreviewOverlay";
  overlay.className = "photo-preview-overlay";
  overlay.innerHTML = `
    <img src="${dataUrl}" alt="Preview" class="photo-preview-img">
    <div class="photo-preview-actions">
      <button class="photo-retake-btn" id="retakeBtn">Retake</button>
      <button class="photo-confirm-btn" id="confirmPhotoBtn">Identify →</button>
    </div>
  `;
  document.getElementById("scanOverlay").appendChild(overlay);

  return new Promise(resolve => {
    document.getElementById("confirmPhotoBtn").addEventListener("click", () => {
      overlay.remove();
      resolve(sendPhotoToAPI(dataUrl));
    });
    document.getElementById("retakeBtn").addEventListener("click", () => {
      overlay.remove();
      resolve();
    });
  });
}

// =============================================================
// Alerts sheet (replaces browser alert())
// =============================================================
function showAlertsSheet() {
  const alerts = state.wishlistAlerts || [];
  const existing = $("#alertsSheet");
  if (existing) existing.remove();

  const sheet = document.createElement("div");
  sheet.id = "alertsSheet";
  sheet.className = "ios-sheet";

  const rows = alerts.length === 0
    ? `<div class="alerts-empty">No new price alerts</div>`
    : alerts.map(a => `
        <div class="alert-row" data-id="${a.id}">
          <div class="alert-row-body">
            <div class="alert-row-name">${a.set_name || a.set_num}</div>
            <div class="alert-row-detail">Dropped to ${fmtMoney(a.current_value)}${a.target_price ? ` · target ${fmtMoney(a.target_price)}` : ""}</div>
          </div>
          <button class="alert-dismiss" data-id="${a.id}" aria-label="Dismiss">×</button>
        </div>
      `).join("");

  sheet.innerHTML = `
    <div class="ios-sheet-inner">
      <div class="ios-sheet-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="margin:0;font-family:var(--serif);font-size:20px">Price Alerts</h3>
        ${alerts.length > 0 ? `<button class="cancel-sm" id="markAllReadBtn">Mark all read</button>` : ""}
      </div>
      <div id="alertsList">${rows}</div>
      <a href="#/wishlist" class="primary-btn" id="viewWishlistBtn" style="display:block;text-align:center;margin-top:16px;text-decoration:none">View wishlist →</a>
    </div>
  `;

  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add("show"));

  async function dismissAlert(id) {
    await api("/wishlist/" + id, { method: "POST" }).catch(() => {});
    state.wishlistAlerts = state.wishlistAlerts.filter(a => a.id !== id);
    const row = sheet.querySelector(`.alert-row[data-id="${id}"]`);
    if (row) row.remove();
    if (!state.wishlistAlerts.length) {
      sheet.querySelector("#alertsList").innerHTML = `<div class="alerts-empty">No new price alerts</div>`;
      sheet.querySelector("#markAllReadBtn")?.remove();
    }
    // Update badge
    const badge = $("#alertsBtn .wishlist-badge");
    if (badge) {
      if (state.wishlistAlerts.length) badge.textContent = state.wishlistAlerts.length;
      else document.querySelector("#alertsBtn")?.remove();
    }
  }

  sheet.querySelectorAll(".alert-dismiss").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); dismissAlert(btn.dataset.id); });
  });

  sheet.querySelector("#markAllReadBtn")?.addEventListener("click", async () => {
    await Promise.all((state.wishlistAlerts || []).map(a => api("/wishlist/" + a.id, { method: "POST" }).catch(() => {})));
    state.wishlistAlerts = [];
    sheet.classList.remove("show");
    setTimeout(() => sheet.remove(), 350);
    document.querySelector("#alertsBtn")?.remove();
  });

  sheet.querySelector("#viewWishlistBtn")?.addEventListener("click", () => {
    sheet.classList.remove("show");
    setTimeout(() => sheet.remove(), 350);
  });

  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) { sheet.classList.remove("show"); setTimeout(() => sheet.remove(), 350); }
  });
}

// =============================================================
// Me page
// =============================================================
async function renderMe() {
  const root = $("#root");
  root.innerHTML = `
    <div class="page">
      ${topBar({ search: false })}
      <div class="skel line" style="width:55%;height:36px;margin:8px 0 6px"></div>
      <div class="skel line" style="width:35%;margin-bottom:20px"></div>
      <div class="skel card" style="height:90px;margin-bottom:12px"></div>
      <div class="skel card" style="height:120px"></div>
    </div>
  `;

  try {
    await Promise.all([
      state.me ? Promise.resolve() : loadMe(),
      state.portfolio ? Promise.resolve() : loadPortfolio(),
      state.wishlist.length === 0 ? loadWishlist() : Promise.resolve(),
    ]);
  } catch (e) { /* non-fatal */ }

  paintMe();
}

function paintMe() {
  const root = $("#root");
  const me = state.me || {};
  const p  = state.portfolio || { total_value: 0, total_paid: 0, items: [] };
  const displayName = me.display_name || "Brick Collector";
  const handle      = me.handle ? "@" + me.handle : "";
  const totalValue  = p.total_value || 0;
  const totalPaid   = p.total_paid  || 0;
  const netRoi      = totalPaid > 0 ? pct(totalValue, totalPaid) : 0;
  const setCount    = p.items?.length || 0;
  const alertCount  = (state.wishlistAlerts || []).length;
  const wishCount   = (state.wishlist || []).length;

  // Best performers
  const performers = (p.items || [])
    .filter(i => i.current_value && (i.purchase_price || i.retail_price))
    .map(i => ({
      ...i,
      roi: i.annualized_roi ?? pct(i.current_value, i.purchase_price || i.retail_price),
    }))
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 3);

  root.innerHTML = `
    <div class="page">
      ${topBar({ search: false, extra: `<a href="/settings.html" class="icon-btn" aria-label="Settings">${I.gear}</a>` })}

      <div class="me-header">
        <div class="me-avatar">${displayName.slice(0, 2).toUpperCase()}</div>
        <div class="me-info">
          <div class="me-name" id="meNameDisplay">${displayName}</div>
          <div class="me-handle">${handle}</div>
        </div>
        <button class="icon-btn" id="editNameBtn" aria-label="Edit name">${I.pencil}</button>
      </div>
      <div id="nameEditWrap" style="display:none;margin-bottom:14px">
        <input type="text" class="price-input" id="nameInput" maxlength="40" value="${displayName}" placeholder="Your display name" style="width:100%">
        <div class="price-edit-btns">
          <button class="cancel-sm" id="cancelNameBtn">Cancel</button>
          <button class="save-sm"   id="saveNameBtn">Save</button>
        </div>
      </div>

      <div class="me-stats-row">
        <div class="me-stat"><div class="me-stat-value">${setCount}</div><div class="me-stat-label">Sets</div></div>
        <div class="me-stat"><div class="me-stat-value">${fmtMoneyShort(totalValue)}</div><div class="me-stat-label">Value</div></div>
        <div class="me-stat"><div class="me-stat-value">${fmtMoneyShort(totalPaid)}</div><div class="me-stat-label">Invested</div></div>
        <div class="me-stat" style="${totalPaid > 0 ? `background:var(${netRoi >= 0 ? "--up-pale" : "--down-soft"})` : ""}"><div class="me-stat-value ${netRoi >= 0 ? "up" : "down"}">${netRoi >= 0 ? "+" : ""}${netRoi.toFixed(1)}%</div><div class="me-stat-label">ROI</div></div>
      </div>

      ${performers.length > 0 ? `
        <div class="card" style="margin-bottom:10px">
          <div class="eyebrow mb-10">Top performers</div>
          ${performers.map((item, i) => `
            <a class="perf-row" href="#/set/${encodeURIComponent(item.set_num)}">
              <span class="perf-rank">#${i+1}</span>
              <img class="perf-img" src="${item.image_url}" alt="${item.name}" onerror="this.style.opacity=0.1">
              <div class="perf-info">
                <div class="perf-name">${item.name}</div>
                <div class="perf-num">${item.theme || "—"}</div>
              </div>
              <div class="perf-roi ${item.roi >= 0 ? "up" : "down"}">${item.roi >= 0 ? "+" : ""}${item.roi.toFixed(1)}%</div>
            </a>
          `).join("")}
        </div>
      ` : ""}

      <div class="me-links-card card tight">
        <a class="me-link-row" href="#/wishlist">
          ${I.heart}
          <span class="me-link-label">Wishlist</span>
          ${wishCount > 0 ? `<span class="me-link-count">${wishCount}</span>` : ""}
          <span class="me-link-chev">${I.chev}</span>
        </a>
        ${alertCount > 0 ? `
          <button class="me-link-row" id="alertsLinkBtn">
            ${I.sparkles}
            <span class="me-link-label">Price alerts</span>
            <span class="me-link-count alert">${alertCount}</span>
            <span class="me-link-chev">${I.chev}</span>
          </button>
        ` : ""}
        <button class="me-link-row" id="meExportBtn">
          ${I.download}
          <span class="me-link-label">Export collection</span>
          <span class="me-link-chev">${I.chev}</span>
        </button>
        <label class="me-link-row" style="cursor:pointer">
          ${I.arrowR}
          <span class="me-link-label">Import CSV</span>
          <input type="file" accept=".csv,text/csv" id="meImportInput" style="display:none">
          <span class="me-link-chev">${I.chev}</span>
        </label>
        <a class="me-link-row" href="/settings.html">
          ${I.gear}
          <span class="me-link-label">Advanced settings</span>
          <span class="me-link-chev">${I.chev}</span>
        </a>
      </div>
    </div>
  `;

  // Edit name
  $("#editNameBtn")?.addEventListener("click", () => {
    $("#nameEditWrap").style.display = "block";
    $("#editNameBtn").style.display  = "none";
    $("#nameInput")?.focus();
    $("#nameInput")?.select();
  });
  $("#cancelNameBtn")?.addEventListener("click", () => {
    $("#nameEditWrap").style.display = "none";
    $("#editNameBtn").style.display  = "";
  });
  $("#saveNameBtn")?.addEventListener("click", async () => {
    const val = ($("#nameInput")?.value || "").trim();
    if (!val) { toast("Name can't be empty", "error"); return; }
    try {
      await api("/me", { method: "PATCH", body: { display_name: val } });
      if (state.me) state.me.display_name = val;
      $("#meNameDisplay").textContent = val;
      $(".me-avatar").textContent = val.slice(0, 2).toUpperCase();
      $("#nameEditWrap").style.display = "none";
      $("#editNameBtn").style.display  = "";
      toast("Name updated", "success");
    } catch (e) { toast(e.message, "error"); }
  });

  $("#alertsLinkBtn")?.addEventListener("click", () => showAlertsSheet());

  $("#meExportBtn")?.addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = API + "/collection/export";
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast("Downloading collection…");
  });

  document.getElementById("meImportInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const r = await fetch(API + "/collection/import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: text,
        credentials: "same-origin",
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) toast(`Imported ${data.imported || 0} sets`, "success");
      else throw new Error(data.error || "Import failed");
    } catch (err) { toast(err.message, "error"); }
    e.target.value = "";
  });
}

// =============================================================
// Wishlist page
// =============================================================
async function renderWishlist() {
  const root = $("#root");
  root.innerHTML = `
    <div class="page">
      <div class="detail-top" style="margin-bottom:16px">
        <button class="icon-btn" onclick="history.length>1?history.back():(location.hash='#/me')">${I.close}</button>
        <span style="font-family:var(--serif);font-size:19px;font-weight:500">Wishlist</span>
        <div></div>
      </div>
      <div class="skel card" style="height:90px;margin-bottom:8px"></div>
      <div class="skel card" style="height:90px;margin-bottom:8px"></div>
      <div class="skel card" style="height:90px"></div>
    </div>
  `;

  try {
    if (state.wishlist.length === 0) await loadWishlist();
  } catch (e) { /* non-fatal */ }

  paintWishlist();
}

function paintWishlist() {
  const root = $("#root");
  const rawItems = state.wishlist || [];

  const sortKey = state.filter.wishlistSort || "recent";
  const items = [...rawItems].sort((a, b) => {
    if (sortKey === "value_desc") return (b.current_value || 0) - (a.current_value || 0);
    if (sortKey === "target_gap") {
      const gapA = a.target_price && a.current_value ? (a.current_value - a.target_price) / a.target_price : Infinity;
      const gapB = b.target_price && b.current_value ? (b.current_value - b.target_price) / b.target_price : Infinity;
      return gapA - gapB;
    }
    // "recent" — keep insertion order (descending id)
    return (b.id || 0) - (a.id || 0);
  });

  const sortChips = [
    { key: "recent", label: "Recent" },
    { key: "value_desc", label: "Value ↓" },
    { key: "target_gap", label: "Closest to target" },
  ];

  root.innerHTML = `
    <div class="page">
      <div class="detail-top" style="margin-bottom:16px">
        <button class="icon-btn" id="wishlistBack">${I.close}</button>
        <span style="font-family:var(--serif);font-size:19px;font-weight:500">Wishlist</span>
        <div></div>
      </div>

      ${rawItems.length === 0 ? `
        <div class="empty">
          <h3>Nothing on your list</h3>
          <p>Tap the ${I.heart} on any set to add it here. You can also set a price alert.</p>
          <a href="#/add" class="add-btn">${I.search} Browse catalog</a>
        </div>
      ` : `
        <div class="filter-row" style="margin-bottom:12px">
          ${sortChips.map(c => `<button class="chip${sortKey === c.key ? " active" : ""}" data-wl-sort="${c.key}">${c.label}</button>`).join("")}
        </div>
        <div class="wishlist-list">
          ${items.map(w => {
            const gap = w.target_price ? pct(w.current_value, w.target_price) - 100 : null;
            const atTarget = gap !== null && gap <= 0;
            const trendUp = w.forecast_2y && w.forecast_2y > w.current_value;
            return `
              <div class="wishlist-card" data-id="${w.id}" data-setnum="${w.set_num}">
                <div class="wl-img-wrap">
                  <img class="wl-img" src="${w.image_url}" alt="${w.name}" onerror="this.style.opacity=0.1">
                </div>
                <div class="wl-body">
                  <div class="wl-name">${w.name}</div>
                  <div class="wl-meta">#${w.set_num}${w.theme ? " · " + w.theme : ""}</div>
                  ${w.target_price ? `
                    <div class="wl-target">
                      Target: ${fmtMoney(w.target_price)}
                      ${atTarget
                        ? `<span class="wl-gap at-target">At target!</span>`
                        : `<span class="wl-gap">${gap >= 0 ? "+" : ""}${gap.toFixed(0)}%</span>`
                      }
                    </div>
                  ` : ""}
                </div>
                <div class="wl-right">
                  <div class="wl-price">${fmtMoney(w.current_value)}</div>
                  <div class="wl-trend ${trendUp ? "up" : "down"}">${trendUp ? I.trend : I.trendDn}</div>
                  <button class="wl-remove" data-id="${w.id}" aria-label="Remove from wishlist">×</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `}
    </div>
  `;

  $("#wishlistBack")?.addEventListener("click", () => {
    if (history.length > 1) history.back(); else location.hash = "#/me";
  });

  $$(".wishlist-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".wl-remove")) return;
      location.hash = "#/set/" + encodeURIComponent(card.dataset.setnum);
    });
  });

  $$(".wl-remove").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      try {
        await api("/wishlist/" + id, { method: "DELETE" });
        state.wishlist = state.wishlist.filter(w => w.id != id);
        paintWishlist();
        toast("Removed from wishlist");
      } catch (err) { toast(err.message, "error"); }
    });
  });

  $$("[data-wl-sort]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter.wishlistSort = btn.dataset.wlSort;
      paintWishlist();
    });
  });
}

function showWishlistPriceSheet(set) {
  return new Promise(resolve => {
    const sheet = document.createElement("div");
    sheet.className = "ios-sheet";
    sheet.innerHTML = `
      <div class="ios-sheet-inner">
        <div class="ios-sheet-handle"></div>
        <h3>Add to wishlist</h3>
        <p style="font-size:13.5px;color:var(--ink-mute);margin:0 0 14px">Set a price alert (optional) — we'll notify you when ${set.name} drops to or below your target.</p>
        <label style="display:block;font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:var(--ink-mute);margin-bottom:6px">Target price</label>
        <input type="number" id="wishlistTargetInput" class="price-input" placeholder="${set.current_value ? Math.round(set.current_value * 0.9) : "0.00"}" step="0.01" min="0" style="width:100%;margin-bottom:14px">
        <div style="display:flex;gap:10px">
          <button class="cancel-sm" id="wishlistSkipBtn" style="flex:1">Skip</button>
          <button class="save-sm" id="wishlistSaveBtn" style="flex:2">Save alert</button>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add("show"));
    function close(val) {
      sheet.classList.remove("show");
      setTimeout(() => sheet.remove(), 350);
      resolve(val);
    }
    document.getElementById("wishlistSkipBtn").addEventListener("click", () => close(null));
    document.getElementById("wishlistSaveBtn").addEventListener("click", () => {
      const v = parseFloat(document.getElementById("wishlistTargetInput").value);
      close(isNaN(v) ? null : v);
    });
    sheet.addEventListener("click", (e) => { if (e.target === sheet) close(null); });
  });
}

function closeScan() {
  $("#scanOverlay").classList.remove("show");
  stopCamera();
  document.getElementById("scanResultCard")?.remove();
  // reset hints
  $("#scanHint").textContent = "Point at a barcode";
  $("#scanSub").textContent  = "Or switch to Photo to identify a built set";
}

// Wire the shutter
document.addEventListener("DOMContentLoaded", () => {
  const cap = $("#scanCapture");
  if (cap) cap.addEventListener("click", capturePhoto);
  // Haptic feedback on nav tab press + scroll-to-top when clicking active tab
  $$(".nav-tab").forEach(t => {
    t.addEventListener("click", () => {
      haptic("light");
      if (t.classList.contains("active")) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
});

// expose to inline handlers
window.bv = { openScan, closeScan, capturePhoto };

// Register service worker (required for Chrome Android install prompt)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// =============================================================
// PWA install prompt
// =============================================================
(function initPWA() {
  if (window.matchMedia("(display-mode: standalone)").matches) return;
  if (localStorage.getItem("bv_pwa_dismissed")) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.pwa.deferredPrompt = e;
    setTimeout(showInstallBanner, 2000);
  });

  const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
  if (isMobile && !state.pwa.deferredPrompt) setTimeout(showInstallBanner, 2500);
})();

function showInstallBanner() {
  if (localStorage.getItem("bv_pwa_dismissed")) return;
  if ($("#installBanner")) return;
  const banner = document.createElement("div");
  banner.id = "installBanner";
  banner.className = "install-banner";
  banner.innerHTML = `
    <div class="ib-icon"><span class="brand-mark" style="width:24px;height:24px;border-radius:5px;flex-shrink:0"></span></div>
    <div class="ib-body">
      <div class="ib-title">Install Brickvault</div>
      <div class="ib-sub">Add to your home screen</div>
    </div>
    <button class="ib-install" id="installBtn">Install</button>
    <button class="ib-dismiss" id="dismissInstall" aria-label="Dismiss">${I.close}</button>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("show"));
  $("#installBtn").addEventListener("click", handleInstall);
  $("#dismissInstall").addEventListener("click", () => {
    banner.classList.remove("show");
    setTimeout(() => banner.remove(), 400);
    localStorage.setItem("bv_pwa_dismissed", "1");
  });
}

async function handleInstall() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (isIOS || !state.pwa.deferredPrompt) { showIOSSheet(); return; }
  if (state.pwa.deferredPrompt) {
    state.pwa.deferredPrompt.prompt();
    const { outcome } = await state.pwa.deferredPrompt.userChoice;
    state.pwa.deferredPrompt = null;
    if (outcome === "accepted") $("#installBanner")?.remove();
  }
}

function showIOSSheet() {
  if ($("#iosInstallSheet")) return;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const instructions = isIOS
    ? `Tap <span class="ios-share-icon">${I.share}</span> in the Safari toolbar, then tap <strong>"Add to Home Screen"</strong> to install Brickvault as an app.`
    : `Tap the browser menu <strong>⋮</strong> then tap <strong>"Add to Home Screen"</strong> or <strong>"Install app"</strong>.`;
  const sheet = document.createElement("div");
  sheet.id = "iosInstallSheet";
  sheet.className = "ios-sheet";
  sheet.innerHTML = `
    <div class="ios-sheet-inner">
      <div class="ios-sheet-handle"></div>
      <h3>Add to Home Screen</h3>
      <p>${instructions}</p>
      <button class="primary-btn" id="closeIOSSheet" style="width:100%">Got it</button>
    </div>
  `;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add("show"));
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeIOSSheet(); });
  $("#closeIOSSheet").addEventListener("click", closeIOSSheet);
  function closeIOSSheet() {
    sheet.classList.remove("show");
    setTimeout(() => sheet.remove(), 350);
  }
}

// =============================================================
// Router
// =============================================================
function setActiveNav(route) {
  $$(".nav-tab").forEach(t => {
    const r = t.dataset.route;
    if (route === "/" && r === "/") t.classList.add("active");
    else if (route.startsWith("/set")) t.classList.toggle("active", r === "/");
    else if (route === "/wishlist") t.classList.toggle("active", r === "/me");
    else t.classList.toggle("active", r === route);
  });
}

let _prevRoute = null;
async function route() {
  const hash = (location.hash || "#/").replace(/^#/, "");
  const root = $("#root");

  const isDetail = hash.startsWith("/set/");
  const wasDetail = _prevRoute && _prevRoute.startsWith("/set/");
  const goingBack = wasDetail && !isDetail;
  if (root) root.classList.toggle("nav-back", goingBack);
  _prevRoute = hash;

  setActiveNav(hash.split("/").slice(0, 2).join("/") || "/");
  window.scrollTo({ top: 0, behavior: "instant" });

  if (hash === "/" || hash === "")  return renderPortfolio();
  if (hash === "/add")              return renderAdd();
  if (hash === "/pile")             return renderPile();
  if (hash === "/blind")            return renderBlind();
  if (hash === "/me")               return renderMe();
  if (hash === "/wishlist")         return renderWishlist();
  const m = hash.match(/^\/set\/(.+)$/);
  if (m)                            return renderSetDetail(decodeURIComponent(m[1]));
  return renderPortfolio();
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);

// =============================================================
// Pull-to-refresh (portfolio page only)
// =============================================================
(function () {
  let ptrStartY = 0;
  let ptrActive = false;
  const THRESHOLD = 72;

  function currentPage() {
    return (location.hash || "#/").replace(/^#/, "") || "/";
  }
  const PTR_PAGES = ["/", "", "/add", "/me", "/wishlist"];
  function isPTRPage() { return PTR_PAGES.includes(currentPage()); }

  document.addEventListener("touchstart", (e) => {
    if (!isPTRPage()) return;
    if (window.scrollY > 4) return;
    ptrStartY = e.touches[0].clientY;
    ptrActive = true;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!ptrActive) return;
    const dy = e.touches[0].clientY - ptrStartY;
    if (dy > THRESHOLD / 2) {
      const ptr = $("#ptrIndicator");
      if (ptr) ptr.classList.add("visible");
    }
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!ptrActive) return;
    ptrActive = false;
    const ptr = $("#ptrIndicator");
    const dy = (e.changedTouches[0]?.clientY || 0) - ptrStartY;
    if (dy >= THRESHOLD && isPTRPage()) {
      haptic("medium");
      const pg = currentPage();
      if (pg === "/" || pg === "") state.portfolio = null;
      else if (pg === "/add")     { state.catalog = null; state.catalogAll = []; }
      else if (pg === "/me")      state.me = null;
      else if (pg === "/wishlist") state.wishlist = [];
      route();
      setTimeout(() => { if (ptr) ptr.classList.remove("visible"); }, 800);
    } else {
      if (ptr) ptr.classList.remove("visible");
    }
  }, { passive: true });
})();

// =============================================================
// Swipe-to-back (from left edge on detail pages)
// =============================================================
(function () {
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeActive = false;
  const EDGE = 44;
  const MIN_DIST = 72;

  document.addEventListener("touchstart", (e) => {
    if (e.touches[0].clientX > EDGE) return;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    swipeActive = true;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!swipeActive) return;
    swipeActive = false;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY);
    const hash = (location.hash || "#/").replace(/^#/, "");
    if (dx >= MIN_DIST && dx > dy * 1.5 && hash.startsWith("/set/")) {
      haptic("light");
      history.back();
    }
  }, { passive: true });
})();
if (document.readyState !== "loading") route();

// =============================================================
// Offline detection
// =============================================================
(function () {
  const banner = document.getElementById("offlineBanner");
  if (!banner) return;
  function sync() {
    banner.classList.toggle("visible", !navigator.onLine);
  }
  window.addEventListener("online",  sync);
  window.addEventListener("offline", sync);
  sync();
})();
