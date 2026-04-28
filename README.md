# 📈 AMFI Mutual Fund Portfolio Tracker

A full-stack web application to track your mutual fund portfolio using live NAV data from [AMFI India](https://www.amfiindia.com).

![Portfolio Tracker](https://img.shields.io/badge/AMFI-Live%20NAV-brightgreen) ![Node.js](https://img.shields.io/badge/Node.js-18%2B-green) ![License](https://img.shields.io/badge/License-MIT-blue)

---

## ✨ Features

- 🔍 **Live search** across 10,000+ mutual fund schemes from AMFI
- 🏦 Filter by category (Equity, Debt, Hybrid, ELSS, Index, Liquid…) and type (Direct / Regular)
- 💰 Real-time portfolio valuation as you enter units
- 📊 AMC-wise allocation breakdown
- 💾 **Export to CSV** with one click
- 📋 Copy portfolio summary to clipboard
- 🔄 Server-side NAV caching (1-hour TTL) for fast responses
- 🌐 REST API for programmatic access
- 🐳 Docker-ready

---

## 🏗 Project Structure

```
amfi-portfolio-tracker/
├── backend/
│   ├── server.js          # Express API server
│   └── package.json
├── frontend/
│   └── public/
│       ├── index.html     # Main UI
│       ├── style.css      # Stylesheet
│       └── app.js         # Frontend logic
├── Dockerfile
├── docker-compose.yml
├── package.json           # Root scripts
└── README.md
```

---

## 🚀 Quick Start

### Option 1: Manual Setup

**Prerequisites:** Node.js 18+

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/amfi-portfolio-tracker.git
cd amfi-portfolio-tracker

# 2. Install backend dependencies
cd backend && npm install && cd ..

# 3. Start the backend (port 3001)
cd backend && npm start

# 4. Open the frontend
# Open frontend/public/index.html in your browser
# OR serve it:
cd frontend && npx serve public -p 3000
```

Then visit **http://localhost:3000**

---

### Option 2: Docker Compose

```bash
docker-compose up --build
```

- Frontend → http://localhost:3000
- Backend API → http://localhost:3001

---

### Option 3: Dev Mode (hot reload)

```bash
npm install          # install root devDependencies
npm run dev          # runs backend (nodemon) + frontend concurrently
```

---

## 🔌 REST API

Base URL: `http://localhost:3001/api`

### GET `/api/health`
Health check.
```json
{ "status": "ok", "timestamp": "2024-02-12T10:00:00.000Z" }
```

---

### GET `/api/funds`
Search and filter funds.

| Param | Type | Description |
|---|---|---|
| `q` | string | Search query (min 2 chars) |
| `category` | string | Category filter (equity, debt, hybrid…) |
| `amc` | string | AMC name filter |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (max: 100, default: 50) |

**Example:**
```
GET /api/funds?q=mirae+asset+large+cap&limit=5
```

```json
{
  "funds": [...],
  "total": 3,
  "page": 1,
  "limit": 5,
  "pages": 1,
  "latestDate": "12-Feb-2026",
  "totalFunds": 11423
}
```

---

### GET `/api/funds/:schemeCode`
Get a single fund by scheme code.

```
GET /api/funds/120503
```

---

### GET `/api/amcs`
List all AMCs.

```json
{ "amcs": ["Aditya Birla Sun Life...", "Axis...", ...], "total": 44 }
```

---

### GET `/api/categories`
List all fund categories.

---

### POST `/api/portfolio/value`
Calculate portfolio value server-side.

**Request body:**
```json
{
  "holdings": [
    { "schemeCode": "120503", "units": 150.5 },
    { "schemeCode": "125494", "units": 200 }
  ]
}
```

**Response:**
```json
{
  "holdings": [
    {
      "schemeCode": "120503",
      "schemeName": "Mirae Asset Large Cap Fund - Direct Plan - Growth",
      "amc": "Mirae Asset Mutual Fund",
      "nav": 112.34,
      "navDate": "12-Feb-2026",
      "units": 150.5,
      "value": 16907.17
    }
  ],
  "totalValue": 38241.50,
  "navDate": "12-Feb-2026",
  "calculatedAt": "2026-02-12T10:30:00.000Z"
}
```

---

### DELETE `/api/cache`
Clear the NAV data cache (forces fresh fetch from AMFI).

---

## ⚙️ Configuration

| Env Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Backend server port |

To change the backend URL in the frontend, edit the top of `frontend/public/app.js`:
```js
const API_BASE = "http://your-server:3001/api";
```

---


## 🚂 Deploying to Railway

This repo is Railway-ready as a **single Node service**: the backend serves both the API and the frontend static files.

1. Create a new Railway project from this GitHub repo.
2. Use the root as the service directory.
3. Railway will run `npm start` (already configured in root `package.json`).
4. Ensure `PORT` is provided by Railway (automatic).

After deploy, open your Railway URL and the UI + API will both be live on the same domain.

## 🌍 Deploying to GitHub Pages (Frontend only)

Since GitHub Pages serves static files, the frontend alone (without a backend) will not work unless you deploy the backend separately.

**Option A:** Deploy backend to [Render](https://render.com) or [Railway](https://railway.app) (free tier), then update `API_BASE` in `app.js` to the deployed URL.

**Option B:** Use the standalone HTML version (no backend needed) — see [releases](../../releases).

---

## 📄 Data Source

NAV data is fetched from:
```
https://www.amfiindia.com/spages/NAVAll.txt
```

Updated daily by AMFI. The backend caches this data for **1 hour** to avoid hammering the AMFI server.

---

## 📝 License

MIT
