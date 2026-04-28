// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE = window.API_BASE || `${window.location.origin}/api`;

// ── State ────────────────────────────────────────────────────────────────────
let holdings = [];          // [{ fund, units }]
let currentView = "grid";
let searchTimer = null;
let kbdIdx = -1;
let lastResults = [];
let navDate = "";
let isFetching = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const searchInput    = document.getElementById("searchInput");
const suggestionBox  = document.getElementById("suggestionBox");
const suggestionList = document.getElementById("suggestionList");
const suggestionHdr  = document.getElementById("suggestionHeader");
const holdingsGrid   = document.getElementById("holdingsGrid");
const emptyState     = document.getElementById("emptyState");
const searchSpinner  = document.getElementById("searchSpinner");

// ── Boot ──────────────────────────────────────────────────────────────────────
(async function init() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error();
    document.getElementById("navMeta").textContent = "Connected to backend — loading AMFI data…";

    // Warm up the cache by fetching a small query
    warmCache();
  } catch (e) {
    document.getElementById("navMeta").textContent =
      "⚠ Backend offline — API is not reachable";
    showToast("Cannot reach backend API.", 4000);
  }
})();

async function warmCache() {
  try {
    const res = await fetch(`${API_BASE}/funds?q=sbi+bluechip&limit=1`);
    const data = await res.json();
    navDate = data.latestDate || "";
    document.getElementById("totalFundCount").textContent =
      (data.totalFunds || "").toLocaleString();
    document.getElementById("navMeta").textContent =
      `Live NAV data · ${(data.totalFunds || "").toLocaleString()} schemes · ${navDate}`;
    document.getElementById("cacheIndicator").textContent = "✓";
    document.getElementById("cacheStatus").title = `NAV cached · Last: ${navDate} · Click to refresh`;
  } catch (e) {}
}

// ── Search ────────────────────────────────────────────────────────────────────
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) { closeSuggestions(); return; }
  searchSpinner.classList.add("active");
  searchTimer = setTimeout(() => doSearch(q), 280);
});

searchInput.addEventListener("keydown", (e) => {
  const items = suggestionList.querySelectorAll(".suggestion-item");
  if (e.key === "ArrowDown") {
    e.preventDefault();
    kbdIdx = Math.min(kbdIdx + 1, items.length - 1);
    highlightItem(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    kbdIdx = Math.max(kbdIdx - 1, 0);
    highlightItem(items);
  } else if (e.key === "Enter" && kbdIdx >= 0) {
    items[kbdIdx]?.click();
  } else if (e.key === "Escape") {
    closeSuggestions();
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-card")) closeSuggestions();
});

function highlightItem(items) {
  items.forEach((el, i) => el.classList.toggle("kbd-active", i === kbdIdx));
  items[kbdIdx]?.scrollIntoView({ block: "nearest" });
}

async function doSearch(q) {
  const cat  = document.getElementById("filterCategory").value;
  const type = document.getElementById("filterType").value;

  let url = `${API_BASE}/funds?q=${encodeURIComponent(q)}&limit=40`;
  if (cat  !== "all") url += `&category=${encodeURIComponent(cat)}`;
  if (type !== "all") url += `&q=${encodeURIComponent(q + " " + type)}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    searchSpinner.classList.remove("active");
    lastResults = data.funds || [];
    kbdIdx = -1;

    if (!lastResults.length) {
      suggestionHdr.textContent = "No results found";
      suggestionList.innerHTML = "";
      suggestionBox.classList.add("open");
      return;
    }

    suggestionHdr.textContent = `${data.total.toLocaleString()} result${data.total !== 1 ? "s" : ""}`;
    suggestionList.innerHTML = lastResults.map((f, i) => `
      <div class="suggestion-item" data-idx="${i}" tabindex="-1">
        <div class="si-top">
          <span class="si-name">${hlText(f.schemeName, q)}</span>
          <span class="si-nav">₹${f.nav.toFixed(4)}</span>
        </div>
        <div class="si-meta">${f.amc} · ${f.schemeCode} · ${f.navDate}</div>
      </div>
    `).join("");

    suggestionList.querySelectorAll(".suggestion-item").forEach((el, i) => {
      el.addEventListener("click", () => addFund(lastResults[i]));
    });

    suggestionBox.classList.add("open");
  } catch (e) {
    searchSpinner.classList.remove("active");
    showToast("Search failed — backend API unavailable.");
  }
}

function closeSuggestions() {
  suggestionBox.classList.remove("open");
  searchSpinner.classList.remove("active");
  kbdIdx = -1;
}

function hlText(text, query) {
  if (!query) return escHtml(text);
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return escHtml(text).replace(re, "<mark>$1</mark>");
}

function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Filters ───────────────────────────────────────────────────────────────────
document.getElementById("filterCategory").addEventListener("change", () => {
  if (searchInput.value.trim().length >= 2) doSearch(searchInput.value.trim());
});
document.getElementById("filterType").addEventListener("change", () => {
  if (searchInput.value.trim().length >= 2) doSearch(searchInput.value.trim());
});

// ── Add / Remove ──────────────────────────────────────────────────────────────
function addFund(fund) {
  if (holdings.find((h) => h.fund.schemeCode === fund.schemeCode)) {
    // Flash existing
    const el = document.querySelector(`[data-scheme="${fund.schemeCode}"]`);
    if (el) {
      el.style.outline = "2px solid var(--accent)";
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => (el.style.outline = ""), 1200);
    }
    showToast("Fund already in portfolio");
    closeSuggestions();
    searchInput.value = "";
    return;
  }

  holdings.push({ fund, units: 0 });
  closeSuggestions();
  searchInput.value = "";

  renderHolding(holdings.length - 1);
  updateSummary();

  // Auto-focus the units input
  setTimeout(() => {
    const input = document.getElementById(`units-${fund.schemeCode}`);
    if (input) input.focus();
  }, 60);
}

function removeHolding(schemeCode) {
  holdings = holdings.filter((h) => h.fund.schemeCode !== schemeCode);
  const el = document.querySelector(`[data-scheme="${schemeCode}"]`);
  if (el) {
    el.style.transition = "opacity 0.18s, transform 0.18s";
    el.style.opacity = "0";
    el.style.transform = "scale(0.97)";
    setTimeout(() => {
      el.remove();
      if (holdings.length === 0) holdingsGrid.appendChild(emptyState);
    }, 190);
  }
  updateSummary();
}

function updateUnits(schemeCode, value) {
  const h = holdings.find((h) => h.fund.schemeCode === schemeCode);
  if (!h) return;
  h.units = parseFloat(value) || 0;

  const valEl = document.getElementById(`val-${schemeCode}`);
  if (valEl) valEl.textContent = formatINR(h.fund.nav * h.units);

  updateSummary();
}

// ── Render holding card ───────────────────────────────────────────────────────
function renderHolding(idx) {
  if (holdingsGrid.contains(emptyState)) holdingsGrid.removeChild(emptyState);

  const { fund, units } = holdings[idx];
  const div = document.createElement("div");
  div.className = "holding-card";
  div.dataset.scheme = fund.schemeCode;

  div.innerHTML = `
    <div class="hc-header">
      <div class="hc-num">${idx + 1}</div>
      <div class="hc-info">
        <div class="hc-name">${escHtml(fund.schemeName)}</div>
        <div class="hc-meta">${escHtml(fund.amc)} · ${fund.schemeCode}</div>
        <div class="hc-cat-tag">${escHtml(fund.category)}</div>
      </div>
      <button class="hc-remove" onclick="removeHolding('${fund.schemeCode}')" title="Remove">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="hc-body">
      <div class="hc-row">
        <div class="chip chip-green">
          <div class="chip-label">NAV</div>
          <div class="chip-value">₹${fund.nav.toFixed(4)}</div>
        </div>
        <div class="units-field">
          <label for="units-${fund.schemeCode}">Units</label>
          <input
            type="number"
            class="units-input"
            id="units-${fund.schemeCode}"
            value="${units || ""}"
            placeholder="0.000"
            step="0.001"
            min="0"
            oninput="updateUnits('${fund.schemeCode}', this.value)"
          >
        </div>
      </div>
      <div class="hc-row">
        <div class="chip chip-gold" style="flex:1;">
          <div class="chip-label">Current Value</div>
          <div class="chip-value" id="val-${fund.schemeCode}">${formatINR(fund.nav * units)}</div>
        </div>
        <div style="font-size:0.7rem;color:var(--ink-3);text-align:right;">
          <div>Date</div>
          <div style="color:var(--ink-2);font-family:'DM Mono',monospace;">${fund.navDate}</div>
        </div>
      </div>
    </div>
  `;

  holdingsGrid.appendChild(div);
  document.getElementById("holdingCount").textContent = holdings.length;
}

// ── Summary ───────────────────────────────────────────────────────────────────
function updateSummary() {
  const total = holdings.reduce((s, h) => s + h.fund.nav * h.units, 0);
  const totalUnits = holdings.reduce((s, h) => s + h.units, 0);
  const avgNav = totalUnits > 0 ? total / totalUnits : 0;

  document.getElementById("summaryTotal").textContent = formatINR(total);
  document.getElementById("summaryFunds").textContent = holdings.length;
  document.getElementById("summaryDate").textContent = navDate || "—";
  document.getElementById("summaryWeighted").textContent =
    avgNav > 0 ? "₹" + avgNav.toFixed(2) : "—";
  document.getElementById("holdingCount").textContent = holdings.length;

  const hasHoldings = holdings.length > 0;
  document.getElementById("btnExport").disabled = !hasHoldings;
  document.getElementById("btnCopy").disabled   = !hasHoldings;
  document.getElementById("btnClear").disabled  = !hasHoldings;

  renderAMCBreakdown(total);
}

function renderAMCBreakdown(total) {
  const card = document.getElementById("amcBreakdownCard");
  const wrap = document.getElementById("amcBreakdown");
  if (holdings.length === 0) { card.style.display = "none"; return; }
  card.style.display = "block";

  const amcMap = {};
  holdings.forEach((h) => {
    const key = h.fund.amc;
    amcMap[key] = (amcMap[key] || 0) + h.fund.nav * h.units;
  });

  const sorted = Object.entries(amcMap).sort((a, b) => b[1] - a[1]);

  wrap.innerHTML = sorted.map(([amc, val]) => {
    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
    return `
      <div class="amc-row">
        <div class="amc-name" title="${escHtml(amc)}">${escHtml(amc)}</div>
        <div class="amc-bar-wrap"><div class="amc-bar" style="width:${pct}%"></div></div>
        <div class="amc-pct">${pct}%</div>
      </div>
    `;
  }).join("");
}

// ── View toggle ───────────────────────────────────────────────────────────────
function setView(v) {
  currentView = v;
  holdingsGrid.classList.toggle("list-view", v === "list");
  document.getElementById("btnGrid").classList.toggle("active", v === "grid");
  document.getElementById("btnList").classList.toggle("active", v === "list");
}

// ── Clear all ─────────────────────────────────────────────────────────────────
function clearAll() {
  if (!confirm("Remove all funds from portfolio?")) return;
  holdings = [];
  holdingsGrid.innerHTML = "";
  holdingsGrid.appendChild(emptyState);
  document.getElementById("holdingCount").textContent = "0";
  updateSummary();
}

// ── Cache refresh ─────────────────────────────────────────────────────────────
async function refreshData() {
  try {
    await fetch(`${API_BASE}/cache`, { method: "DELETE" });
    showToast("NAV cache cleared — will reload on next search");
    document.getElementById("cacheIndicator").textContent = "●";
    warmCache();
  } catch (e) {
    showToast("Could not reach backend");
  }
}

// ── Server-side portfolio valuation ──────────────────────────────────────────
// (Triggered by Recalculate button if added, or call directly)
async function recalculateFromServer() {
  if (holdings.length === 0) return;
  try {
    const payload = holdings.map((h) => ({
      schemeCode: h.fund.schemeCode,
      units: h.units,
    }));
    const res  = await fetch(`${API_BASE}/portfolio/value`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings: payload }),
    });
    const data = await res.json();

    // Update values from server response
    data.holdings.forEach((sh) => {
      const h = holdings.find((x) => x.fund.schemeCode === sh.schemeCode);
      if (h) {
        h.fund.nav = sh.nav;
        h.fund.navDate = sh.navDate;
        const valEl = document.getElementById(`val-${sh.schemeCode}`);
        if (valEl) valEl.textContent = formatINR(sh.value);
      }
    });

    navDate = data.navDate;
    updateSummary();
    showToast(`Portfolio recalculated · Total: ${formatINR(data.totalValue)}`);
  } catch (e) {
    showToast("Recalculation failed");
  }
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV() {
  const header = "Scheme Code,Fund Name,AMC,Category,NAV (₹),Units,Value (₹),NAV Date";
  const rows = holdings.map((h) => {
    const val = (h.fund.nav * h.units).toFixed(2);
    return [
      h.fund.schemeCode,
      `"${h.fund.schemeName}"`,
      `"${h.fund.amc}"`,
      `"${h.fund.category}"`,
      h.fund.nav.toFixed(4),
      h.units,
      val,
      h.fund.navDate,
    ].join(",");
  });
  const total = holdings.reduce((s, h) => s + h.fund.nav * h.units, 0);
  rows.push(`,,,,,,${total.toFixed(2)},Total`);

  const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV downloaded");
}

// ── Copy summary ──────────────────────────────────────────────────────────────
function copyPortfolio() {
  const lines = holdings.map(
    (h) =>
      `${h.fund.schemeName}\n  ${h.units} units × ₹${h.fund.nav} = ${formatINR(h.fund.nav * h.units)}`
  );
  const total = holdings.reduce((s, h) => s + h.fund.nav * h.units, 0);
  const text =
    `MF Portfolio (${navDate})\n${"─".repeat(44)}\n` +
    lines.join("\n") +
    `\n${"─".repeat(44)}\nTotal: ${formatINR(total)}`;
  navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard!"));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatINR(val) {
  if (isNaN(val) || val === null) return "₹0.00";
  return (
    "₹" +
    Number(val).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function showToast(msg, duration = 2200) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), duration);
}
