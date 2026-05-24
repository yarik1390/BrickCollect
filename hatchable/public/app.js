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
  const f = Number(n) || 0;
  if (Math.abs(f) >= 1_000_000) return "$" + (f / 1_000_000).toFixed(1) + "M";
  if (Math.abs(f) >= 1_000)     return "$" + (f / 1_000).toFixed(1) + "K";
  return fmtMoney(f, 0);
}
function pct(a, b) {
  if (!b) return 0;
  return ((a - b) / b) * 100;
}
function haptic(type = "light") {
  try { window.navigator.vibrate?.(type === "heavy" ? 30 : type === "medium" ? 15 : 8); } catch {}
  try { window.webkit?.messageHandlers?.haptic?.postMessage(type); } catch {}
}

// ===== API helpers ===========================================
async function api(path, opts = {}) {
  const { method = "GET", body, headers = {} } = opts;
  const fetchOpts = { method, headers: { ...headers } };
  if (body) {
    fetchOpts.headers["Content-Type"] = "application/json";
    fetchOpts.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, fetchOpts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function scanIdentify(body) {
  return api("/scan/identify", { method: "POST", body });
}
async function addToCollection(setNum, quantity = 1) {
  return api("/collection", { method: "POST", body: { set_num: setNum, quantity } });
}
async function removeFromCollection(setNum) {
  return api("/collection/" + encodeURIComponent(setNum), { method: "DELETE" });
}
async function loadPortfolio() {
  const data = await api("/collection");
  state.portfolio = data;
  return data;
}
async function loadThemes() {
  const data = await api("/themes");
  state.themes = data.themes || [];
  return data;
}
async function loadCatalog(q = "", theme = null) {
  const params = new URLSearchParams();
  if (q)     params.set("q", q);
  if (theme) params.set("theme", theme);
  const data = await api("/sets/search?" + params);
  state.catalog = data;
  state.catalogAll = data.sets || [];
  state.catalogPage = 1;
  return data;
}
async function loadWishlist() {
  const data = await api("/wishlist");
  state.wishlist       = data.wishlist       || [];
  state.wishlistAlerts = data.unread_alerts  || [];
  return data;
}
async function loadMe() {
  try { state.me = await api("/me"); } catch { state.me = null; }
}

// ===== history / sparkline ===================================
function buildHistory(seed, start, end, points = 30) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const rand = () => { h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h ^= h >>> 16; return (h >>> 0) / 0xffffffff; };
  const pts = [];
  let v = start;
  for (let i = 0; i < points; i++) {
    v += (rand() - 0.45) * (end - start) * 0.15;
    pts.push(v);
  }
  pts[pts.length - 1] = end;
  return pts;
}

// ===== toast =================================================
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  clearTimeout(state.toastTimer);
  el.textContent = msg;
  el.className = "toast show " + type;
  state.toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}

// ===== icons =================================================
const I = {
  home:    `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10l7-7 7 7M4 9v8a1 1 0 001 1h4v-5h2v5h4a1 1 0 001-1V9"/></svg>`,
  search:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="9" r="5" stroke-linecap="round"/><path stroke-linecap="round" d="M17 17l-3.5-3.5"/></svg>`,
  scan:    `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7V5a1 1 0 011-1h2M13 4h2a1 1 0 011 1v2M16 13v2a1 1 0 01-1 1h-2M7 16H5a1 1 0 01-1-1v-2"/><line x1="2" y1="10" x2="18" y2="10" stroke-linecap="round"/></svg>`,
  plus:    `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M10 5v10M5 10h10"/></svg>`,
  minus:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M5 10h10"/></svg>`,
  check:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 10l5 5 7-8"/></svg>`,
  trash:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M6 7h8M9 7V5h2v2M7 7l1 9h4l1-9"/></svg>`,
  chev:    `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 5l4 5-4 5"/></svg>`,
  close:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M5 5l10 10M15 5L5 15"/></svg>`,
  gear:    `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="2.5"/><path stroke-linecap="round" d="M10 3v1M10 16v1M3 10h1M16 10h1M5.4 5.4l.7.7M13.9 13.9l.7.7M14.6 5.4l-.7.7M6.1 13.9l-.7.7"/></svg>`,
  layers:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M2 7l8-4 8 4-8 4-8-4zM2 12l8 4 8-4M2 10l8 4 8-4"/></svg>`,
  bell:    `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M10 2a6 6 0 016 6c0 4 1.5 5 1.5 5h-15S4 12 4 8a6 6 0 016-6zM9 17h2"/></svg>`,
  heart:   `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.6"><path stroke-linecap="round" stroke-linejoin="round" d="M10 17s-7-4.5-7-10a4 4 0 017-2.65A4 4 0 0117 7c0 5.5-7 10-7 10z"/></svg>`,
  filter:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5h14M6 10h8M9 15h2"/></svg>`,
  arrowR:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 10h10M11 6l4 4-4 4"/></svg>`,
  arrowU:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 15V5M6 9l4-4 4 4"/></svg>`,
  arrowD:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 5v10M6 11l4 4 4-4"/></svg>`,
  sparkles:`<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.6"><path stroke-linecap="round" stroke-linejoin="round" d="M10 2l1.4 4.6L16 8l-4.6 1.4L10 14l-1.4-4.6L4 8l4.6-1.4L10 2z"/></svg>`,
  download:`<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M10 3v10M6 13l4 4 4-4M3 17h14"/></svg>`,
  pencil: `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M13 4l3 3-8 8-3.5.5.5-3.5 8-8zM11 6l3 3"/></svg>`,
  eye:    `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="10" cy="10" r="2"/></svg>`,
  dollar: `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" d="M10 3v14M7 6h4.5a2.5 2.5 0 010 5h-3a2.5 2.5 0 000 5H13"/></svg>`,
  share:  `<svg fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M14 8a3 3 0 100-6 3 3 0 000 6zM6 10a3 3 0 100-6 3 3 0 000 6zM14 18a3 3 0 100-6 3 3 0 000 6zM8.59 11.51l2.83 1.98M11.41 6.51L8.59 8.49"/></svg>`,
};

// ===== topBar ================================================
function topBar(opts = {}) {
  const { search = true, extra = "" } = opts;
  const alertCount = (state.wishlistAlerts || []).length;
  return `
    <div class="top-bar">
      <span class="brand-name">Brickvault</span>
      <div style="display:flex;gap:8px;align-items:center">
        ${search ? `
          <button class="icon-btn" id="searchToggle" aria-label="Search">${I.search}</button>
        ` : ""}
        <button class="icon-btn" id="alertsBtn" aria-label="Notifications" style="position:relative">
          ${I.bell}
          ${alertCount > 0 ? `<span class="notif-dot">${alertCount}</span>` : ""}
        </button>
        ${extra}
      </div>
    </div>
    ${search ? `<div class="portfolio-search-wrap" id="searchWrap">
      <input class="portfolio-search" id="portfolioSearch" placeholder="Search sets…" aria-label="Search portfolio">
    </div>` : ""}
  `;
}

// ===== offline banner ========================================
window.addEventListener("online",  () => $("#offlineBanner")?.classList.remove("show"));
window.addEventListener("offline", () => $("#offlineBanner")?.classList.add("show"));
if (!navigator.onLine) $("#offlineBanner")?.classList.add("show");

// ===== Pull-to-refresh =======================================
const PTR_PAGES = ["/", "", "/add", "/me", "/wishlist"];
function isPTRPage() { return PTR_PAGES.includes(currentPage()); }
let ptrStartY = 0, ptrDist = 0, ptrActive = false;
const ptrEl = document.getElementById("ptrIndicator");

document.addEventListener("touchstart", e => {
  if (!isPTRPage() || window.scrollY > 0) return;
  ptrStartY = e.touches[0].clientY;
  ptrActive = false;
}, { passive: true });
document.addEventListener("touchmove", e => {
  if (!isPTRPage() || window.scrollY > 0) return;
  ptrDist = e.touches[0].clientY - ptrStartY;
  if (ptrDist > 8) {
    ptrActive = true;
    if (ptrEl) {
      ptrEl.style.transform = `translateY(${Math.min(ptrDist * 0.4, 56)}px)`;
      ptrEl.style.opacity   = String(Math.min(ptrDist / 80, 1));
    }
  }
}, { passive: true });
document.addEventListener("touchend", async () => {
  if (!ptrActive) return;
  if (ptrEl) { ptrEl.style.transform = ""; ptrEl.style.opacity = ""; }
  if (ptrDist < 80) { ptrDist = 0; ptrActive = false; return; }
  ptrDist = 0; ptrActive = false;
  haptic("medium");
  ptrEl?.classList.add("spinning");
  try {
    const pg = currentPage();
    if (pg === "/" || pg === "")  { state.portfolio = null; await loadPortfolio(); paintPortfolio(); }
    else if (pg === "/add")       { state.catalog = null; state.catalogAll = []; await renderAdd(); }
    else if (pg === "/me")        { state.me = null; await loadMe(); paintMe(); }
    else if (pg === "/wishlist")  { state.wishlist = []; await loadWishlist(); paintWishlist(); }
  } catch (e) { toast(e.message, "error"); }
  finally { ptrEl?.classList.remove("spinning"); }
});

// ===== PWA install prompt ====================================
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  state.pwa.deferredPrompt = e;
});

// =============================================================
// Portfolio
// =============================================================
function currentPage() {
  const hash = location.hash.replace("#", "");
  if (hash.startsWith("/set/")) return "/set/";
  return hash || "/";
}

function setActiveNav(route) {
  $$("#nav .nav-tab").forEach(t => {
    const r = t.dataset.route;
    if (route === "/" && r === "/")         t.classList.add("active");
    else if (route.startsWith("/set"))       t.classList.toggle("active", r === "/");
    else if (route === "/wishlist")          t.classList.toggle("active", r === "/me");
    else                                     t.classList.toggle("active", r === route);
  });
}

async function renderPortfolio() {
  setActiveNav("/");
  const root = $("#root");

  if (!state.portfolio) {
    root.innerHTML = `<div class="page">${topBar()}<div class="skel card mb-12" style="height:180px"></div><div class="skel line" style="width:120px;margin-bottom:16px"></div><div class="grid"><div class="skel card"></div><div class="skel card"></div></div></div>`;
    await Promise.all([
      loadPortfolio(),
      api("/collection/history?days=90").then(r => { state.portfolioHistory = r.snapshots || []; }).catch(() => {}),
      loadWishlist(),
    ]);
  }
  paintPortfolio();
}

function paintPortfolio() {
  const root = $("#root");
  const p = state.portfolio;
  if (!p) return;

  const { items = [], total_value = 0, total_paid = 0 } = p;
  const alertCount = (state.wishlistAlerts || []).length;
  const wishCount  = (state.wishlist || []).length;

  // Sort
  const sortKey = state.filter.sort;
  const sorted = [...items].sort((a, b) => {
    if (sortKey === "added_desc")  return new Date(b.added_at) - new Date(a.added_at);
    if (sortKey === "added_asc")   return new Date(a.added_at) - new Date(b.added_at);
    if (sortKey === "value_desc")  return (b.current_value || 0) - (a.current_value || 0);
    if (sortKey === "value_asc")   return (a.current_value || 0) - (b.current_value || 0);
    if (sortKey === "roi_desc")    return (b.annualized_roi || 0) - (a.annualized_roi || 0);
    if (sortKey === "name_asc")    return (a.name || "").localeCompare(b.name || "");
    return 0;
  });

  // Search filter
  const q = (state.filter.q || "").toLowerCase();
  const visible = q ? sorted.filter(i =>
    (i.name || "").toLowerCase().includes(q) ||
    (i.set_num || "").toLowerCase().includes(q)
  ) : sorted;

  // Range filter on portfolio history
  const rangeDays = { "1W": 7, "1M": 30, "3M": 90, "1Y": 365, "ALL": Infinity };
  const rDays = rangeDays[state.filter.range] || 30;
  const cutoff = rDays === Infinity ? 0 : Date.now() - rDays * 86400_000;
  const allSnapshots = state.portfolioHistory || [];
  const snapshots = allSnapshots.filter(s => new Date(s.snapshot_at).getTime() >= cutoff);

  // Build chart
  let chartData, chartStart, chartEnd;
  if (snapshots.length >= 2) {
    chartData  = snapshots.map(s => s.total_value);
    chartStart = snapshots[0].total_value;
    chartEnd   = snapshots[snapshots.length - 1].total_value;
  } else {
    chartData  = buildHistory("portfolio:" + items.length, total_paid || total_value * 0.8, total_value, 30);
    chartStart = chartData[0];
    chartEnd   = total_value;
  }
  const delta = chartEnd - chartStart;
  const up    = delta >= 0;

  // Kind filter
  const kindFiltered = state.filter.kind === "all"
    ? visible
    : state.filter.kind === "wishlist"
      ? visible.filter(i => (state.wishlist || []).some(w => w.set_num === i.set_num))
      : visible.filter(i => (i.theme || "").toLowerCase().includes(state.filter.kind));

  root.innerHTML = `
    <div class="page">
      ${topBar()}

      <div class="hero card mb-16">
        <div class="hero-inner">
          <div class="hero-label">Total value</div>
          <div class="hero-value">
            <span class="hero-currency">$</span>
            <span>${(total_value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="hero-invested">Invested: ${fmtMoney(total_paid)}</div>
          <div class="hero-delta ${up ? "up" : "down"}">${up ? "+" : ""}${fmtMoney(delta)} <span class="hero-delta-pct">(${up ? "+" : ""}${pct(chartEnd, chartStart).toFixed(1)}%)</span></div>
        </div>
        <div class="hero-chart" id="heroChart"></div>
        <div class="range-pills">
          ${["1W","1M","3M","1Y","ALL"].map(r =>
            `<button class="range-pill ${state.filter.range === r ? "active" : ""}" data-range="${r}">${r}</button>`
          ).join("")}
        </div>
      </div>

      <div class="filter-row" id="themeBar">
        <button class="chip ${state.filter.sort === "added_desc" ? "active" : ""}" data-sort="added_desc">Recent</button>
        <button class="chip ${state.filter.sort === "value_desc" ? "active" : ""}" data-sort="value_desc">By value</button>
        <button class="chip ${state.filter.sort === "roi_desc" ? "active" : ""}" data-sort="roi_desc">By ROI</button>
        <button class="chip ${state.filter.sort === "name_asc" ? "active" : ""}" data-sort="name_asc">A–Z</button>
      </div>

      <div class="set-list" id="setList">
        ${kindFiltered.length === 0 ? `
          <div class="empty">
            ${ items.length === 0 ? `
              <div class="onboarding-card">
                <div class="onboarding-title">Welcome to Brickvault</div>
                <p class="onboarding-sub">Your LEGO portfolio lives here. Let's add your first set.</p>
                <div class="onboarding-steps">
                  <div class="onboarding-step">
                    <div class="onboarding-step-icon">${I.scan}</div>
                    <div>
                      <strong>Scan a box</strong>
                      <p>Use your camera to scan a barcode or photograph a set</p>
                    </div>
                  </div>
                  <div class="onboarding-step">
                    <div class="onboarding-step-icon">${I.search}</div>
                    <div>
                      <strong>Search the catalog</strong>
                      <p>Browse 20,000+ sets by name, number, or theme</p>
                    </div>
                  </div>
                  <div class="onboarding-step">
                    <div class="onboarding-step-icon">${I.layers}</div>
                    <div>
                      <strong>Track your value</strong>
                      <p>AI-powered pricing updates automatically</p>
                    </div>
                  </div>
                </div>
                <a href="#/add" class="primary-btn">Browse catalog →</a>
              </div>
            ` : `<h3>No sets match</h3><p>Clear the search or try a different filter.</p>`}
          </div>
        ` : kindFiltered.map(item => setListCardHTML(item)).join("")}
      </div>
    </div>
  `;

  // Hide hero when portfolio is empty — show onboarding card directly
  if (items.length === 0) {
    const heroEl = root.querySelector(".hero");
    if (heroEl) heroEl.style.display = "none";
  }

  // wire range pills
  $$("#root .range-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter.range = btn.dataset.range;
      paintPortfolio();
    });
  });

  // wire sort chips
  $$("#themeBar .chip[data-sort]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter.sort = btn.dataset.sort;
      localStorage.setItem("bv_sort", btn.dataset.sort);
      paintPortfolio();
    });
  });

  // wire alerts
  $("#alertsBtn")?.addEventListener("click", () => showAlertsSheet());

  // portfolio search
  const searchToggle = $("#searchToggle");
  const searchWrap   = $("#searchWrap");
  const searchInput  = $("#portfolioSearch");
  searchToggle?.addEventListener("click", () => {
    const open = searchWrap?.classList.toggle("open");
    if (open) searchInput?.focus();
    else { state.filter.q = ""; paintPortfolio(); }
  });
  searchInput?.addEventListener("input", () => {
    state.filter.q = searchInput.value;
    paintPortfolio();
  });

  wireCardLongPress(".set-list");

  // Draw chart
  const heroChart = $("#heroChart");
  if (heroChart) drawSparkline(heroChart, chartData, { up, dot: true, scrubLabelFor: (v) => fmtMoneyShort(v) });
}

function setListCardHTML(item) {
  const val    = (item.current_value || 0) * (item.quantity || 1);
  const paid   = (item.purchase_price || item.retail_price || 0) * (item.quantity || 1);
  const gain   = val - paid;
  const gainPct = paid > 0 ? pct(val, paid) : null;
  const up     = gain >= 0;
  const isNew  = item.added_at && (Date.now() - new Date(item.added_at).getTime() < 7 * 86400_000);
  return `
    <div class="set-list-card" data-set="${encodeURIComponent(item.set_num)}">
      <div class="set-img" style="position:relative">
        <img src="${item.image_url}" alt="${item.name}" loading="lazy" onerror="this.style.opacity=0.12">
        ${isNew ? `<span class="new-badge">NEW</span>` : ""}
      </div>
      <div class="set-body">
        <div class="set-name">${item.name}</div>
        <div class="set-meta">${item.theme || ""} · #${item.set_num}${item.quantity > 1 ? " · ×" + item.quantity : ""}</div>
        <div class="set-foot">
          <span class="set-val">${fmtMoney(val)}</span>
          ${gainPct !== null ? `<span class="sl-roi ${up ? "up" : "down"}">${up ? "+" : ""}${gainPct.toFixed(1)}%</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

// ===== Long-press quick actions ==============================
function wireCardLongPress(containerSel) {
  const container = $(containerSel);
  if (!container) return;
  let pressTimer = null;
  container.addEventListener("touchstart", e => {
    const card = e.target.closest(".set-list-card");
    if (!card) return;
    pressTimer = setTimeout(() => {
      haptic("heavy");
      showCardQuickActions(card);
    }, 500);
  }, { passive: true });
  container.addEventListener("touchend",  () => clearTimeout(pressTimer));
  container.addEventListener("touchmove", () => clearTimeout(pressTimer));
}

function showCardQuickActions(card) {
  document.querySelector(".quick-actions-menu")?.remove();
  const setNum = decodeURIComponent(card.dataset.set || "");
  if (!setNum) return;
  const rect = card.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "quick-actions-menu";
  menu.style.top  = (rect.bottom + window.scrollY + 4) + "px";
  menu.style.left = (rect.left + window.scrollX) + "px";
  menu.innerHTML = `
    <div class="qa-item" data-action="view">${I.eye} View details</div>
    <div class="qa-item" data-action="price">${I.dollar} Edit price / date</div>
    <div class="qa-item danger" data-action="remove">${I.trash} Remove</div>
    <div class="qa-item" data-action="cancel">${I.close} Cancel</div>
  `;
  document.body.appendChild(menu);
  const dismiss = () => menu.remove();
  menu.addEventListener("click", async (e) => {
    const action = e.target.closest(".qa-item")?.dataset.action;
    dismiss();
    if (action === "view")   location.hash = "#/set/" + encodeURIComponent(setNum);
    if (action === "price")  location.hash = "#/set/" + encodeURIComponent(setNum) + "?tab=manage";
    if (action === "remove") {
      try {
        await removeFromCollection(setNum);
        await loadPortfolio();
        paintPortfolio();
        toast("Removed", "success");
      } catch (e) { toast(e.message, "error"); }
    }
  });
  setTimeout(() => document.addEventListener("touchstart", dismiss, { once: true }), 50);
}

// =============================================================
// Sparkline
// =============================================================
function drawSparkline(container, data, opts = {}) {
  const { up = true, dot = false, scrubLabelFor = null } = opts;
  if (!data || data.length < 2) { container.innerHTML = ""; return; }
  const W = container.clientWidth  || 300;
  const H = container.clientHeight || 80;
  const pad = dot ? 6 : 2;
  const mn = Math.min(...data), mx = Math.max(...data);
  const range = mx - mn || 1;
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (W - pad * 2));
  const ys = data.map(v => H - pad - ((v - mn) / range) * (H - pad * 2));
  const path = xs.map((x, i) => (i === 0 ? "M" : "L") + x.toFixed(1) + " " + ys[i].toFixed(1)).join(" ");
  const fill = xs.map((x, i) => (i === 0 ? "M" : "L") + x.toFixed(1) + " " + ys[i].toFixed(1)).join(" ")
    + ` L${(W - pad).toFixed(1)} ${H} L${pad} ${H} Z`;
  const color = up ? "var(--up)" : "var(--down)";
  const lastX = xs[xs.length - 1], lastY = ys[ys.length - 1];
  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible">
      <defs>
        <linearGradient id="sg_${container.id || 'x'}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${fill}" fill="url(#sg_${container.id || 'x'})" />
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            style="stroke-dasharray:2000;stroke-dashoffset:2000;animation:chart-draw 600ms var(--ease,ease) forwards"/>
      ${dot ? `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4" fill="${color}"/>` : ""}
    </svg>
  `;

  // Scrub
  if (scrubLabelFor) {
    const svg = container.querySelector("svg");
    const lbl = document.createElement("div");
    lbl.className = "scrub-label";
    container.appendChild(lbl);
    svg.addEventListener("touchmove", e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const fx = (e.touches[0].clientX - r.left) / r.width;
      const idx = Math.round(fx * (data.length - 1));
      const v = data[Math.max(0, Math.min(idx, data.length - 1))];
      lbl.textContent = scrubLabelFor(v);
      lbl.style.left = (fx * 100) + "%";
      lbl.classList.add("show");
    }, { passive: false });
    svg.addEventListener("touchend", () => lbl.classList.remove("show"));
  }
}

// ===== Set detail ==============================================
function shareSet(set, entry) {
  const url = location.origin + "/#/set/" + encodeURIComponent(set.set_num);
  const text = `${set.name} (#${set.set_num})`;
  if (navigator.share) {
    navigator.share({ title: text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => toast("Link copied!", "success")).catch(() => toast("Could not copy link", "error"));
  }
}

async function renderSetDetail(setNum, opts = {}) {
  setActiveNav("/");
  const root = $("#root");
  root.innerHTML = `<div class="page"><div class="skel card" style="height:260px;margin-bottom:16px"></div><div class="skel line" style="width:60%;margin-bottom:12px"></div><div class="skel line" style="width:40%"></div></div>`;

  const [rawSet, collEntry] = await Promise.all([
    api("/sets/" + encodeURIComponent(setNum)).catch(() => null),
    api("/collection").then(d => (d.items || []).find(i => i.set_num === setNum)).catch(() => null),
  ]);

  const setData = rawSet?.set || null;
  if (!setData) { root.innerHTML = `<div class="page"><p>Set not found.</p></div>`; return; }
  if (opts.tab) state.detail.tab = opts.tab;

  paintSetDetail(setData, collEntry);
}

function paintSetDetail(set, entry) {
  const root = $("#root");
  const qty  = entry?.quantity || 0;
  const inCollection = qty > 0;
  const TABS = ["info", "forecast", "manage"];
  const tab  = state.detail.tab;

  root.innerHTML = `
    <div class="page no-pad">
      <div class="detail-hero">
        <div class="detail-hero-bg" style="background-image:url('${set.image_url}')"></div>
        <div class="detail-hero-overlay"></div>
        <button class="detail-back" id="detailBack" aria-label="Back">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <img class="detail-img" src="${set.image_url}" alt="${set.name}" onerror="this.style.opacity=0.15">
      </div>
      <div class="detail-title-row">
        <div class="detail-title-inner">
          <div class="detail-eyebrow">${set.theme || ""} · #${set.set_num}</div>
          <div class="detail-title">${set.name}</div>
        </div>
        <button class="icon-btn detail-share-btn" aria-label="Share">${I.share}</button>
      </div>

      <div class="detail-tabs">
        ${TABS.map(t => `<button class="detail-tab${tab === t ? " active" : ""}" data-tab="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`).join("")}
      </div>
      <div class="tab-dots">
        ${TABS.map(t => `<span class="tab-dot${tab === t ? " active" : ""}"></span>`).join("")}
      </div>

      <div class="detail-tab-panel active" id="tabPanels">
        ${ tab === "info" ? renderInfoTab(set, entry) : "" }
        ${ tab === "forecast" ? renderForecastTab(set, entry) : "" }
        ${ tab === "manage" ? renderManageTab(set, entry) : "" }
      </div>
    </div>
  `;

  // tab switching
  $$("#root .detail-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.detail.tab = btn.dataset.tab;
      haptic("light");
      paintSetDetail(set, entry);
    });
  });

  // swipe between tabs
  const panels = $("#tabPanels");
  let tx = 0, ty = 0;
  if (panels) {
    panels.addEventListener("touchstart", e => {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
    }, { passive: true });
    panels.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - tx;
      const dy = Math.abs(e.changedTouches[0].clientY - ty);
      if (Math.abs(dx) < 60 || Math.abs(dx) < dy) return;
      const cur  = TABS.indexOf(state.detail.tab);
      const next = dx < 0 ? Math.min(cur + 1, TABS.length - 1) : Math.max(cur - 1, 0);
      if (next !== cur) {
        state.detail.tab = TABS[next];
        haptic("light");
        paintSetDetail(set, entry);
      }
    });
  }

  // wire manage tab interactions
  if (tab === "manage") wireManageTab(set, entry);
  if (tab === "info")    wireInfoTab(set, entry);
  if (tab === "forecast") { window._currentSet = set; maybePaintForecastChart(); }

  $$(".detail-share-btn").forEach(btn =>
    btn.addEventListener("click", () => shareSet(set, entry))
  );
  $("#detailBack")?.addEventListener("click", () => history.back());
}

function renderInfoTab(set, entry) {
  const qty = entry?.quantity || 0;
  const inCollection = qty > 0;
  return `
    <div class="detail-section">
      <div class="stat-grid">
        <div class="stat"><span class="k">Retail</span>   <span class="v">${fmtMoney(set.retail_price)}</span></div>
        <div class="stat"><span class="k">Est. value</span><span class="v">${fmtMoney(set.current_value)}</span></div>
        <div class="stat"><span class="k">Pieces</span>   <span class="v">${set.pieces || "—"}</span></div>
        <div class="stat"><span class="k">Year</span>      <span class="v">${set.year || "—"}</span></div>
        <div class="stat"><span class="k">Minifigs</span>  <span class="v">${set.minifigs || "—"}</span></div>
        <div class="stat"><span class="k">Status</span>    <span class="v">${set.retired ? "Retired" : "Active"}</span></div>
      </div>
      <div class="detail-actions">
        ${inCollection
          ? `<div class="qty-row">
               <button class="qty-btn" id="qtyDown" aria-label="Decrease">−</button>
               <span class="qty-val">${qty}</span>
               <button class="qty-btn" id="qtyUp" aria-label="Increase">+</button>
             </div>`
          : `<button class="add-btn" id="addBtn">Add to collection</button>`
        }
        <button class="icon-btn" id="wishlistBtn" aria-label="${(state.wishlist||[]).some(w=>w.set_num===set.set_num)?'In wishlist':'Add to wishlist'}">
          ${I.heart}
        </button>
      </div>
      <div class="sparkline-wrap" id="setChart" style="height:72px;margin-top:16px"></div>
    </div>
  `;
}

function wireInfoTab(set, entry) {
  const qty = entry?.quantity || 0;
  const inWishlist = (state.wishlist || []).some(w => w.set_num === set.set_num);
  const wishBtn = $("#wishlistBtn");
  if (wishBtn) {
    wishBtn.classList.toggle("active", inWishlist);
    wishBtn.addEventListener("click", async () => {
      try {
        if (inWishlist) {
          const wl = state.wishlist.find(w => w.set_num === set.set_num);
          if (wl) await api("/wishlist/" + wl.id, { method: "DELETE" });
          toast("Removed from wishlist", "info");
        } else {
          await api("/wishlist", { method: "POST", body: { set_num: set.set_num } });
          toast("Added to wishlist", "success");
        }
        await loadWishlist();
        paintSetDetail(set, entry);
      } catch (e) { toast(e.message, "error"); }
    });
  }

  // Draw price-history sparkline on info tab
  const setChartEl = $("#setChart");
  if (setChartEl) {
    const hist = buildHistory(set.set_num, set.retail_price || set.current_value * 0.8, set.current_value, 30);
    const up = (set.current_value || 0) >= (set.retail_price || 0);
    drawSparkline(setChartEl, hist, { up });
  }

  if (qty > 0) {
    $("#qtyDown")?.addEventListener("click", async () => {
      if (qty <= 1) return;
      const optimistic = { ...entry, quantity: qty - 1 };
      paintSetDetail(set, optimistic);
      try {
        await api("/collection/" + encodeURIComponent(set.set_num), { method: "PATCH", body: { quantity: qty - 1 } });
        await loadPortfolio();
      } catch (e) { toast(e.message, "error"); paintSetDetail(set, entry); }
    });
    $("#qtyUp")?.addEventListener("click", async () => {
      const optimistic = { ...entry, quantity: qty + 1 };
      paintSetDetail(set, optimistic);
      try {
        await api("/collection/" + encodeURIComponent(set.set_num), { method: "PATCH", body: { quantity: qty + 1 } });
        await loadPortfolio();
      } catch (e) { toast(e.message, "error"); paintSetDetail(set, entry); }
    });
  } else {
    $("#addBtn")?.addEventListener("click", async () => {
      try {
        await addToCollection(set.set_num, 1);
        await loadPortfolio();
        const newEntry = (state.portfolio?.items || []).find(i => i.set_num === set.set_num);
        state.detail.tab = "manage";
        paintSetDetail(set, newEntry);
        haptic("heavy");
        toast("Added!", "success");
      } catch (e) { toast(e.message, "error"); }
    });
  }
}

function renderForecastTab(set, entry) {
  const qty = entry?.quantity || 0;
  if (!set.forecast_2y && !set.forecast_5y) {
    return `<div class="detail-section"><p class="muted">Forecast unavailable for this set.</p></div>`;
  }
  const hist = buildHistory(set.set_num, set.retail_price, set.current_value, 30);
  return `
    <div class="detail-section">
      <div class="forecast-hero">
        <div class="forecast-label">2-year forecast</div>
        <div class="forecast-amt">${fmtMoneyShort(qty > 0 ? set.forecast_2y * qty : set.forecast_2y)}</div>
        <div class="forecast-sub">vs today ${fmtMoney(qty > 0 ? set.current_value * qty : set.current_value)}</div>
      </div>
      <div class="forecast-row">
        <div class="forecast-card">
          <div class="forecast-card-label">5-yr forecast</div>
          <div class="forecast-card-val">${fmtMoneyShort(qty > 0 ? set.forecast_5y * qty : set.forecast_5y)}</div>
        </div>
        <div class="forecast-card">
          <div class="forecast-card-label">Retail</div>
          <div class="forecast-card-val">${fmtMoney(set.retail_price)}</div>
        </div>
      </div>
      <div class="forecast-copy">${set.forecast_summary || "Forecast based on theme, year, piece count, and historical LEGO appreciation trends."}</div>
      <div class="sparkline-wrap" id="detailChart" style="height:80px;margin-top:16px"></div>
    </div>
  `;
}

function renderManageTab(set, entry) {
  if (!entry || entry.quantity < 1) {
    return `<div class="detail-section"><p class="muted">Add this set to your collection first.</p></div>`;
  }
  return `
    <div class="detail-section manage-section">
      <div class="price-card">
        <div class="price-label">Purchase price</div>
        <div class="price-row">
          <span class="price-curr">$</span>
          <input type="number" class="price-input" id="priceInput" value="${entry.purchase_price != null ? entry.purchase_price : ""}" placeholder="0.00" step="0.01" min="0">
        </div>
        <div class="manage-label" style="margin-top:6px;font-size:10px">Auto-saves on exit</div>
      </div>

      <div class="price-card">
        <div class="price-label">Purchase date</div>
        <input type="date" class="date-input" id="purchasedAtInput"
          value="${entry.purchased_at ? entry.purchased_at.split("T")[0] : ""}">
      </div>

      <div class="price-card">
        <div class="price-label">Condition</div>
        <select class="condition-sel" id="conditionSel">
          <option value="new"           ${entry.condition === "new"            ? "selected" : ""}>New / Sealed</option>
          <option value="sealed"        ${entry.condition === "sealed"         ? "selected" : ""}>Factory Sealed (MISB)</option>
          <option value="used_good"     ${entry.condition === "used_good"      ? "selected" : ""}>Used – Good</option>
          <option value="used_acceptable" ${entry.condition === "used_acceptable" ? "selected" : ""}>Used – Acceptable</option>
        </select>
      </div>

      <div class="price-card">
        <div class="price-label">Notes</div>
        <textarea class="notes-ta" id="notesTa" rows="3" placeholder="Any notes about this set…">${entry.notes || ""}</textarea>
        <div class="price-edit-btns">
          <button class="save-sm" id="saveNotes">Save notes</button>
        </div>
      </div>

      ${entry.purchase_price != null ? `
        <div class="pl-row">
          <div class="pl-item ${(set.current_value - entry.purchase_price) >= 0 ? "up" : "down"}">
            <span class="pl-label">P&amp;L</span>
            <span class="pl-val">${(set.current_value - entry.purchase_price) >= 0 ? "+" : ""}${fmtMoney((set.current_value - entry.purchase_price) * entry.quantity)}</span>
          </div>
          <div class="pl-item">
            <span class="pl-label">ROI</span>
            <span class="pl-val">${pct(set.current_value, entry.purchase_price).toFixed(1)}%</span>
          </div>
          ${entry.annualized_roi != null ? `
            <div class="pl-item">
              <span class="pl-label">Ann. ROI</span>
              <span class="pl-val">${entry.annualized_roi.toFixed(1)}%/yr</span>
            </div>
          ` : ""}
          ${entry.added_at ? `<span class="price-date">· ${new Date(entry.added_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>` : ""}
        </div>
      ` : ""}

      <button class="danger-btn" id="removeBtn">Remove from collection</button>
    </div>
  `;
}

function wireManageTab(set, entry) {
  const priceInput = $("#priceInput");
  async function savePrice() {
    const val = parseFloat(priceInput?.value);
    if (isNaN(val) || val < 0) return;
    if (val === (entry.purchase_price ?? NaN) && !isNaN(entry.purchase_price)) return;
    try {
      await api("/collection/" + encodeURIComponent(set.set_num), { method: "PATCH", body: { purchase_price: val } });
      await loadPortfolio();
      const updated = (state.portfolio?.items || []).find(i => i.set_num === set.set_num);
      if (updated) entry = updated;
      toast("Price saved", "success");
    } catch (e) { toast(e.message, "error"); }
  }
  priceInput?.addEventListener("blur", savePrice);
  priceInput?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); priceInput.blur(); } });

  $("#purchasedAtInput")?.addEventListener("change", async (e) => {
    const val = e.target.value;
    try {
      await api("/collection/" + encodeURIComponent(set.set_num), { method: "PATCH", body: { purchased_at: val || null } });
      await loadPortfolio();
      const updated = (state.portfolio?.items || []).find(i => i.set_num === set.set_num);
      if (updated) paintSetDetail(set, updated);
      toast("Date saved", "success");
    } catch (e) { toast(e.message, "error"); }
  });

  $("#conditionSel")?.addEventListener("change", async (e) => {
    try {
      await api("/collection/" + encodeURIComponent(set.set_num), { method: "PATCH", body: { condition: e.target.value } });
      toast("Condition saved", "success");
    } catch (e) { toast(e.message, "error"); }
  });

  $("#saveNotes")?.addEventListener("click", async () => {
    const notes = $("#notesTa")?.value || "";
    try {
      await api("/collection/" + encodeURIComponent(set.set_num), { method: "PATCH", body: { notes } });
      toast("Notes saved", "success");
    } catch (e) { toast(e.message, "error"); }
  });

  $("#removeBtn")?.addEventListener("click", async () => {
    try {
      await removeFromCollection(set.set_num);
      await loadPortfolio();
      haptic("medium");
      toast("Removed", "success");
      history.back();
    } catch (e) { toast(e.message, "error"); }
  });
}

// forecast chart draw
document.addEventListener("DOMContentLoaded", () => {
  // handled via MutationObserver-free approach: chart drawn in paintSetDetail
});

function maybePaintForecastChart() {
  const chartEl = $("#detailChart");
  if (!chartEl) return;
  const set = window._currentSet;
  if (!set) return;
  const hist = buildHistory(set.set_num, set.retail_price, set.current_value, 30);
  const up = (set.current_value || 0) >= (set.retail_price || 0);
  drawSparkline(chartEl, hist, { up, dot: true, scrubLabelFor: v => fmtMoneyShort(v) });
}

// =============================================================
// Catalog (Add page)
// =============================================================
async function renderAdd() {
  setActiveNav("/add");
  const root = $("#root");

  root.innerHTML = `
    <div class="page">
      ${topBar({ search: false })}
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
  if (state.filter.catalogYear !== "all") {
    const yLabels = { "2020s": "2020s", "2010s": "2010s", "pre2010": "Pre-2010" };
    activeFilters.push({ key: "year", label: yLabels[state.filter.catalogYear] || state.filter.catalogYear });
  }
  if (state.filter.catalogRetired) activeFilters.push({ key: "retired", label: "Retired" });

  wrap.innerHTML = `
    ${incomplete ? `<div class="search-incomplete-banner">⚠ Live catalog search unavailable — showing local results only.</div>` : ""}
    ${activeFilters.length > 0 ? `<div class="active-filters-row">${activeFilters.map(f => `<button class="active-filter-chip" data-filter="${f.key}">× ${f.label}</button>`).join("")}</div>` : ""}
    <div class="results-count">${filtered.length} set${filtered.length !== 1 ? "s" : ""}</div>
    <div class="results-grid" id="catalogGrid">
      ${visible.map(cardHTML).join("")}
    </div>
    ${hasMore ? `<div id="catalogSentinel" class="loading-more"><span class="spinner"></span></div>` : ""}
  `;

  const grid = $("#catalogGrid");
  if (grid) wireCards(grid);

  wrap.querySelectorAll(".active-filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const f = chip.dataset.filter;
      if (f === "year")    { state.filter.catalogYear = "all";  state.catalogPage = 1; paintCatalogResults(); }
      if (f === "retired") { state.filter.catalogRetired = false; state.catalogPage = 1; paintCatalogResults(); }
    });
  });

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
    haptic("heavy");
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

  setActiveNav("/pile");
  $("#scanBarcodeBtn")?.addEventListener("click", () => openScan("barcode"));
  $("#scanCta")?.addEventListener("click", () => openScan("photo"));
  $("#alertsBtn")?.addEventListener("click", () => showAlertsSheet());
}

// =============================================================
// Blind Bag page
// =============================================================
async function renderBlind() {
  setActiveNav("/blind");
  const root = $("#root");
  root.innerHTML = `
    <div class="page">
      ${topBar({ search: false })}
      <div class="eyebrow mb-8">Mystery</div>
      <h1 class="h-display mb-16">Blind Bag</h1>
      <div class="skel card" style="height:200px"></div>
    </div>
  `;

  try {
    const data = await api("/minifigs?random=true&limit=40");
    const figs = data.minifigs || [];
    const series = data.series || [];

    root.innerHTML = `
      <div class="page">
        ${topBar({ search: false })}
        <div class="eyebrow mb-8">Mystery</div>
        <h1 class="h-display mb-16">Blind Bag</h1>

        <div class="filter-row mb-16" id="seriesChips">
          <button class="chip active" data-series="">All series</button>
          ${series.slice(0, 8).map(s => `<button class="chip" data-series="${s}">${s}</button>`).join("")}
        </div>

        <div class="fig-grid" id="figGrid">
          ${figs.map(fig => `
            <div class="fig-card fig-${fig.rarity || "common"}" data-fig="${fig.fig_num}">
              <img src="${fig.image_url}" alt="${fig.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="fig-img-placeholder">🧱</span>
              <div class="fig-name">${fig.name}</div>
              <div class="fig-series">${fig.series || ""}</div>
              <div class="fig-val">${fig.value ? fmtMoney(fig.value) : ""}</div>
              <span class="fig-rarity rarity-${fig.rarity}">${fig.rarity || ""}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    // wire series chips
    $$("#seriesChips .chip").forEach(btn => {
      btn.addEventListener("click", async () => {
        $$("#seriesChips .chip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const s = btn.dataset.series;
        const d = await api("/minifigs?random=true&limit=40" + (s ? "&series=" + encodeURIComponent(s) : ""));
        const g = $("#figGrid");
        if (g) g.innerHTML = (d.minifigs || []).map(fig => `
          <div class="fig-card fig-${fig.rarity || "common"}" data-fig="${fig.fig_num}">
            <img src="${fig.image_url}" alt="${fig.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="fig-img-placeholder">🧱</span>
            <div class="fig-name">${fig.name}</div>
            <div class="fig-series">${fig.series || ""}</div>
            <div class="fig-val">${fig.value ? fmtMoney(fig.value) : ""}</div>
            <span class="fig-rarity rarity-${fig.rarity}">${fig.rarity || ""}</span>
          </div>
        `).join("");
      });
    });

    $("#alertsBtn")?.addEventListener("click", () => showAlertsSheet());
  } catch (e) {
    root.innerHTML += `<div class="page"><p class="muted">Could not load minifigs: ${e.message}</p></div>`;
  }
}

// =============================================================
// Alerts sheet
// =============================================================
function showAlertsSheet() {
  const alerts = state.wishlistAlerts || [];
  const sheet = document.createElement("div");
  sheet.className = "ios-sheet";
  sheet.innerHTML = `
    <div class="ios-sheet-handle"></div>
    <div class="ios-sheet-inner">
      <div class="ios-sheet-head">
        <h3>Price Alerts</h3>
        ${alerts.length > 0 ? `<button class="link-btn" id="markAllRead">Mark all read</button>` : ""}
      </div>
      <div id="alertsList">
        ${alerts.length === 0
          ? `<div class="alerts-empty">No new alerts</div>`
          : alerts.map(a => `
            <div class="alert-row" data-id="${a.id}">
              <div class="alert-body">
                <div class="alert-name">${a.set_name}</div>
                <div class="alert-detail">Dropped to ${fmtMoney(a.current_value)} · target ${fmtMoney(a.target_price)}</div>
                <div class="alert-time">${new Date(a.triggered_at).toLocaleDateString()}</div>
              </div>
              <button class="alert-dismiss" data-id="${a.id}" aria-label="Dismiss">×</button>
            </div>
          `).join("")}
      </div>
      <div class="alerts-footer">
        <a class="alerts-wl-link" href="#/wishlist" onclick="this.closest('.ios-sheet').remove()">View wishlist →</a>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add("show"));

  const dismiss = () => { sheet.classList.remove("show"); setTimeout(() => sheet.remove(), 300); };
  sheet.addEventListener("click", e => { if (e.target === sheet) dismiss(); });

  $("#markAllRead")?.addEventListener("click", async () => {
    for (const a of alerts) {
      await api("/wishlist/" + a.id, { method: "POST" }).catch(() => {});
    }
    state.wishlistAlerts = [];
    dismiss();
    toast("All alerts cleared", "success");
    paintPortfolio();
  });

  sheet.querySelectorAll(".alert-dismiss").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.dataset.id);
      await api("/wishlist/" + id, { method: "POST" }).catch(() => {});
      state.wishlistAlerts = state.wishlistAlerts.filter(a => a.id !== id);
      btn.closest(".alert-row").remove();
      if (!$("#alertsList .alert-row")) $("#alertsList").innerHTML = `<div class="alerts-empty">No new alerts</div>`;
    });
  });
}

// =============================================================
// Me page
// =============================================================
async function renderMe() {
  setActiveNav("/me");
  const root = $("#root");
  root.innerHTML = `<div class="page">${topBar({ search: false })}<div class="skel card" style="height:80px;margin-bottom:16px"></div><div class="skel line" style="margin-bottom:12px"></div><div class="skel line" style="width:60%"></div></div>`;

  await Promise.all([
    state.portfolio ? Promise.resolve() : loadPortfolio(),
    state.me ? Promise.resolve() : loadMe(),
    state.wishlist.length === 0 ? loadWishlist() : Promise.resolve(),
  ]);

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
        <div class="me-stat" style="${totalPaid > 0 ? (netRoi >= 0 ? "background:var(--up-pale)" : "background:var(--down-soft)") : ""}"><div class="me-stat-value ${netRoi >= 0 ? "up" : "down"}">${netRoi >= 0 ? "+" : ""}${netRoi.toFixed(1)}%</div><div class="me-stat-label">ROI</div></div>
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
          <span style="color:var(--lego-red)">${I.heart}</span>
          <span class="me-link-label">Wishlist</span>
          ${wishCount > 0 ? `<span class="me-link-count">${wishCount}</span>` : ""}
          <span class="me-link-chev">${I.chev}</span>
        </a>
        ${alertCount > 0 ? `
          <button class="me-link-row" id="alertsLinkBtn">
            <span style="color:var(--lego-yellow)">${I.sparkles}</span>
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
    window.location.href = API + "/collection/export";
  });

  $("#meImportInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await api("/collection/import", {
        method: "POST",
        body: { csv: text },
      });
      await loadPortfolio();
      toast(`Imported ${res.imported} sets` + (res.skipped > 0 ? `, skipped ${res.skipped}` : ""), "success");
      paintMe();
    } catch (e) { toast(e.message, "error"); }
  });

  $("#alertsBtn")?.addEventListener("click", () => showAlertsSheet());
}

// =============================================================
// Wishlist page
// =============================================================
async function renderWishlist() {
  setActiveNav("/wishlist");
  const root = $("#root");
  root.innerHTML = `<div class="page">${topBar({ search: false })}<div class="skel card" style="height:80px;margin-bottom:8px"></div><div class="skel card" style="height:80px"></div></div>`;

  if (state.wishlist.length === 0) await loadWishlist();

  paintWishlist();
}

function paintWishlist() {
  const root = $("#root");
  const rawItems = state.wishlist || [];
  const wSort = state.filter.wishlistSort || "recent";
  const items = [...rawItems].sort((a, b) => {
    if (wSort === "value_desc") return (b.current_value || 0) - (a.current_value || 0);
    if (wSort === "gap_asc") {
      const gA = a.target_price && a.current_value ? (a.current_value - a.target_price) / a.target_price : Infinity;
      const gB = b.target_price && b.current_value ? (b.current_value - b.target_price) / b.target_price : Infinity;
      return gA - gB;
    }
    return 0;
  });

  root.innerHTML = `
    <div class="page">
      ${topBar({ search: false })}
      <div class="eyebrow mb-8">My list</div>
      <h1 class="h-display mb-16">Wishlist</h1>
      ${rawItems.length > 0 ? `<div class="filter-row mb-12">
        <button class="chip ${wSort === "recent" ? "active" : ""}" data-wsort="recent">Recent</button>
        <button class="chip ${wSort === "value_desc" ? "active" : ""}" data-wsort="value_desc">Value ↓</button>
        <button class="chip ${wSort === "gap_asc" ? "active" : ""}" data-wsort="gap_asc">Closest to target</button>
      </div>` : ""}
      ${items.length === 0
        ? `<div class="empty"><h3>No sets yet</h3><p>Tap the heart icon on any set to add it here.</p></div>`
        : items.map(w => {
            const gap = w.target_price && w.current_value
              ? (w.current_value - w.target_price) / w.target_price * 100
              : null;
            const trend = w.forecast_2y && w.current_value
              ? (w.forecast_2y > w.current_value ? "↑" : "↓")
              : "";
            return `
              <div class="wishlist-card" data-id="${w.id}">
                <img class="wl-img" src="${w.image_url}" alt="${w.name}" onerror="this.style.opacity=0.15">
                <div class="wl-body">
                  <div class="wl-name">${w.name}</div>
                  <div class="wl-meta">#${w.set_num}${w.theme ? " · " + w.theme : ""}</div>
                  <div class="wl-foot">
                    <span class="wl-price">${fmtMoney(w.current_value || 0)}</span>
                    ${gap !== null
                      ? gap <= 0
                        ? `<span class="wl-gap-badge at-target">At target!</span>`
                        : `<span class="wl-gap-badge">${gap.toFixed(0)}% to target</span>`
                      : ""}
                    ${trend ? `<span class="wl-trend">${trend}</span>` : ""}
                  </div>
                </div>
                <button class="wl-remove" data-id="${w.id}" aria-label="Remove">${I.close}</button>
              </div>
            `;
          }).join("")}
    </div>
  `;

  root.querySelectorAll("[data-wsort]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter.wishlistSort = btn.dataset.wsort;
      paintWishlist();
    });
  });

  root.querySelectorAll(".wishlist-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".wl-remove")) return;
      const item = items.find(w => w.id === parseInt(card.dataset.id));
      if (item) location.hash = "#/set/" + encodeURIComponent(item.set_num);
    });

    // Swipe-left to remove
    let swipeStartX = 0;
    card.addEventListener("touchstart", e => { swipeStartX = e.touches[0].clientX; }, { passive: true });
    card.addEventListener("touchend", async e => {
      const dx = e.changedTouches[0].clientX - swipeStartX;
      if (dx < -60) {
        const id = parseInt(card.dataset.id);
        card.style.transition = "transform 0.2s, opacity 0.2s";
        card.style.transform = "translateX(-100%)";
        card.style.opacity = "0";
        setTimeout(async () => {
          try {
            await api("/wishlist/" + id, { method: "DELETE" });
            state.wishlist = state.wishlist.filter(w => w.id !== id);
            haptic("medium");
            paintWishlist();
            toast("Removed from wishlist", "info");
          } catch (err) { toast(err.message, "error"); paintWishlist(); }
        }, 200);
      }
    }, { passive: true });
  });

  root.querySelectorAll(".wl-remove").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      try {
        await api("/wishlist/" + id, { method: "DELETE" });
        state.wishlist = state.wishlist.filter(w => w.id !== id);
        paintWishlist();
        haptic("medium");
        toast("Removed from wishlist", "info");
      } catch (err) { toast(err.message, "error"); }
    });
  });

  $("#alertsBtn")?.addEventListener("click", () => showAlertsSheet());
}

// =============================================================
// Camera / scan
// =============================================================
async function openScan(mode = "barcode") {
  const overlay = $("#scanOverlay");
  if (!overlay) return;

  // Camera permission pre-check dialog
  if (!state.camera.stream) {
    const perm = await navigator.permissions?.query({ name: "camera" }).catch(() => null);
    if (perm?.state === "prompt") {
      const dlg = document.createElement("div");
      dlg.className = "cam-perm-dialog";
      dlg.innerHTML = `
        <div class="cam-perm-inner">
          <div style="font-size:32px">📷</div>
          <h3>Camera access</h3>
          <p>Brickvault needs your camera to scan barcodes and identify sets by photo.</p>
          <button class="primary-btn" id="camPermBtn">Allow camera</button>
          <button class="link-btn" id="camPermSkip">Not now</button>
        </div>
      `;
      document.body.appendChild(dlg);
      await new Promise(resolve => {
        $("#camPermBtn").addEventListener("click", () => { dlg.remove(); resolve(true); });
        $("#camPermSkip").addEventListener("click", () => { dlg.remove(); resolve(false); });
      });
    }
  }

  overlay.classList.add("show");
  state.camera.mode = mode;

  // Set mode UI
  const toggle = $("#scanModeToggle");
  if (toggle) {
    toggle.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  }
  const cap = $("#scanCapture");
  if (cap) cap.style.display = mode === "photo" ? "block" : "none";

  const hint = $("#scanHint");
  const sub  = $("#scanSub");
  if (mode === "barcode") {
    if (hint) hint.textContent = "Point at a barcode";
    if (sub)  sub.textContent  = "Or switch to Photo to identify a built set";
  } else {
    if (hint) hint.textContent = "Frame the set";
    if (sub)  sub.textContent  = "Then tap the shutter button";
  }

  // Wire mode toggle
  toggle?.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = btn.dataset.mode;
      state.camera.mode = m;
      toggle.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
      if (cap) cap.style.display = m === "photo" ? "block" : "none";
      if (m === "barcode") {
        if (hint) hint.textContent = "Point at a barcode";
        if (sub)  sub.textContent  = "Or switch to Photo to identify a built set";
        state.camera.scanning = true;
        scanLoop();
      } else {
        if (hint) hint.textContent = "Frame the set";
        if (sub)  sub.textContent  = "Then tap the shutter button";
        state.camera.scanning = false;
      }
    });
  });

  await startCamera();
  if (mode === "barcode") {
    state.camera.scanning = true;
    scanLoop();
  }
}

async function startCamera() {
  if (state.camera.stream) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    state.camera.stream = stream;
    const video = $("#scanVideo");
    if (video) { video.srcObject = stream; await video.play(); }

    if ("BarcodeDetector" in window) {
      state.camera.detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    }
  } catch (e) {
    toast("Camera error: " + e.message, "error");
  }
}

function stopCamera() {
  state.camera.scanning = false;
  state.camera.stream?.getTracks().forEach(t => t.stop());
  state.camera.stream = null;
  const video = $("#scanVideo");
  if (video) { video.srcObject = null; }
}

function flash() {
  const f = $("#scanFlash");
  if (!f) return;
  f.classList.add("flash");
  haptic("medium");
  setTimeout(() => f.classList.remove("flash"), 300);
}

async function scanLoop() {
  const detector = state.camera.detector;
  const video    = $("#scanVideo");
  if (!detector || !video || !state.camera.scanning) return;

  const tick = async () => {
    if (!state.camera.scanning) return;
    if (video.readyState < 2) { requestAnimationFrame(tick); return; }
    try {
      const codes = await detector.detect(video);
      if (codes.length > 0) {
        state.camera.scanning = false;
        await onBarcode(codes[0].rawValue);
        return;
      }
    } catch {}
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
      resolve(null);
    });
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
  const scanClose = $("#scanCloseBtn");
  if (scanClose) scanClose.addEventListener("click", () => closeScan());
  // Haptic feedback + scroll-to-top when tapping active nav tab
  $$("#nav .nav-tab").forEach(t => {
    t.addEventListener("click", () => {
      haptic("light");
      if (t.classList.contains("active")) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        document.getElementById("root")?.scrollTo({ top: 0, behavior: "smooth" });
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
// Router
// =============================================================
function route() {
  const hash = location.hash.replace("#", "") || "/";
  setActiveNav(hash.startsWith("/set/") ? "/set/" : hash);

  if (hash === "/" || hash === "")  return renderPortfolio();
  if (hash === "/add")              return renderAdd();
  if (hash === "/pile")             return renderPile();
  if (hash === "/blind")            return renderBlind();
  if (hash === "/me")               return renderMe();
  if (hash === "/wishlist")         return renderWishlist();
  if (hash.startsWith("/set/")) {
    const parts = hash.split("/");
    const setNum = decodeURIComponent(parts[2] || "");
    const tabArg = parts[3] ? { tab: parts[3] } : {};
    return renderSetDetail(setNum, tabArg);
  }
  // 404 fallback
  $("#root").innerHTML = `<div class="page"><p>Page not found.</p></div>`;
}

window.addEventListener("hashchange", route);
window.addEventListener("load", route);

// Swipe-back gesture
let swipeStartX = 0;
document.addEventListener("touchstart", e => {
  swipeStartX = e.touches[0].clientX;
}, { passive: true });
document.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - swipeStartX;
  if (dx > 60 && swipeStartX < 44 && window.history.length > 1) {
    history.back();
  }
}, { passive: true });