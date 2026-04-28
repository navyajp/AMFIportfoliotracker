const express = require("express");
const axios = require("axios");
const cors = require("cors");
const NodeCache = require("node-cache");

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // cache NAV data for 1 hour

app.use(cors());
app.use(express.json());

const AMFI_URL = "https://www.amfiindia.com/spages/NAVAll.txt";
const CACHE_KEY = "amfi_nav_data";

// ── Parse AMFI text format ─────────────────────────────────────────────────
function parseAMFI(text) {
  const lines = text.split("\n");
  const funds = [];
  let currentCategory = "";
  let currentAMC = "";
  let latestDate = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("Scheme Code;")) continue;

    // Category header (no semicolons, starts with Open/Close/Interval)
    if (
      (line.startsWith("Open Ended") ||
        line.startsWith("Close Ended") ||
        line.startsWith("Interval")) &&
      !line.includes(";")
    ) {
      currentCategory = line.replace(/[()]/g, " ").trim();
      continue;
    }

    // AMC name line
    if (!line.includes(";")) {
      currentAMC = line.trim();
      continue;
    }

    const parts = line.split(";");
    if (parts.length < 5) continue;

    const schemeCode = parts[0].trim();
    const isinGrowth = parts[1].trim();
    const isinIdcw = parts[2].trim();
    const schemeName = parts[3].trim();
    const navStr = parts[4].trim();
    const navDate = parts[5] ? parts[5].trim() : "";
    const nav = parseFloat(navStr);

    if (!schemeCode || !schemeName || isNaN(nav)) continue;

    if (navDate && !latestDate) latestDate = navDate;

    funds.push({
      schemeCode,
      isinGrowth: isinGrowth === "-" ? null : isinGrowth,
      isinIdcw: isinIdcw === "-" ? null : isinIdcw,
      schemeName,
      nav,
      navDate,
      amc: currentAMC,
      category: currentCategory,
    });
  }

  return { funds, latestDate, totalCount: funds.length };
}

// ── Fetch + cache AMFI data ────────────────────────────────────────────────
async function getAMFIData() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const response = await axios.get(AMFI_URL, {
    timeout: 30000,
    responseType: "text",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": "https://www.amfiindia.com/",
      "Connection": "keep-alive",
    },
  });

  const parsed = parseAMFI(response.data);
  cache.set(CACHE_KEY, parsed);
  return parsed;
}

// ── GET /api/health ────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── GET /api/funds ─────────────────────────────────────────────────────────
// Query params: q (search), category, amc, page, limit
app.get("/api/funds", async (req, res) => {
  try {
    const data = await getAMFIData();

    let funds = data.funds;
    const { q, category, amc, page = 1, limit = 50 } = req.query;

    // Filter by search query
    if (q && q.trim().length >= 2) {
      const query = q.toLowerCase().trim();
      funds = funds.filter(
        (f) =>
          f.schemeName.toLowerCase().includes(query) ||
          f.schemeCode.includes(query) ||
          f.amc.toLowerCase().includes(query)
      );
    }

    // Filter by category keyword
    if (category && category !== "all") {
      const cat = category.toLowerCase();
      funds = funds.filter(
        (f) =>
          f.category.toLowerCase().includes(cat) ||
          f.schemeName.toLowerCase().includes(cat)
      );
    }

    // Filter by AMC
    if (amc && amc !== "all") {
      funds = funds.filter(
        (f) => f.amc.toLowerCase() === amc.toLowerCase()
      );
    }

    const total = funds.length;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const start = (pageNum - 1) * limitNum;
    const paginated = funds.slice(start, start + limitNum);

    res.json({
      funds: paginated,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      latestDate: data.latestDate,
      totalFunds: data.totalCount,
    });
  } catch (err) {
    console.error("Error fetching funds:", err.message);
    res.status(500).json({ error: "Failed to fetch AMFI data", details: err.message });
  }
});

// ── GET /api/funds/:schemeCode ─────────────────────────────────────────────
app.get("/api/funds/:schemeCode", async (req, res) => {
  try {
    const data = await getAMFIData();
    const fund = data.funds.find(
      (f) => f.schemeCode === req.params.schemeCode
    );
    if (!fund) return res.status(404).json({ error: "Fund not found" });
    res.json(fund);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/amcs ──────────────────────────────────────────────────────────
app.get("/api/amcs", async (req, res) => {
  try {
    const data = await getAMFIData();
    const amcs = [...new Set(data.funds.map((f) => f.amc))].sort();
    res.json({ amcs, total: amcs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/categories ────────────────────────────────────────────────────
app.get("/api/categories", async (req, res) => {
  try {
    const data = await getAMFIData();
    const categories = [...new Set(data.funds.map((f) => f.category))].sort();
    res.json({ categories, total: categories.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/portfolio/value ──────────────────────────────────────────────
// Body: { holdings: [{ schemeCode, units }] }
app.post("/api/portfolio/value", async (req, res) => {
  try {
    const { holdings } = req.body;

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return res.status(400).json({ error: "holdings must be a non-empty array" });
    }

    const data = await getAMFIData();
    const fundMap = new Map(data.funds.map((f) => [f.schemeCode, f]));

    let totalValue = 0;
    const enriched = holdings.map((h) => {
      const fund = fundMap.get(String(h.schemeCode));
      if (!fund) return { ...h, error: "Fund not found", value: 0 };

      const units = parseFloat(h.units) || 0;
      const value = parseFloat((fund.nav * units).toFixed(2));
      totalValue += value;

      return {
        schemeCode: fund.schemeCode,
        schemeName: fund.schemeName,
        amc: fund.amc,
        category: fund.category,
        nav: fund.nav,
        navDate: fund.navDate,
        units,
        value,
      };
    });

    res.json({
      holdings: enriched,
      totalValue: parseFloat(totalValue.toFixed(2)),
      navDate: data.latestDate,
      calculatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cache/status ──────────────────────────────────────────────────
app.get("/api/cache/status", (req, res) => {
  const keys = cache.keys();
  res.json({
    cached: keys.includes(CACHE_KEY),
    ttl: cache.getTtl(CACHE_KEY),
    keys,
  });
});

// ── DELETE /api/cache ──────────────────────────────────────────────────────
app.delete("/api/cache", (req, res) => {
  cache.flushAll();
  res.json({ message: "Cache cleared" });
});

// ── Start server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 AMFI Portfolio Backend running on http://localhost:${PORT}`);
  console.log(`   GET  /api/funds?q=hdfc&limit=20`);
  console.log(`   GET  /api/funds/:schemeCode`);
  console.log(`   GET  /api/amcs`);
  console.log(`   GET  /api/categories`);
  console.log(`   POST /api/portfolio/value`);
  console.log(`   GET  /api/health\n`);
});
