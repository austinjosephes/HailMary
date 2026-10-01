# അമ്മയോടൊപ്പം | CLC Velappaya
### 100,000 Hail Marys Devotional Offering Campaign

> **"United in Prayer with Our Blessed Mother"**  
> *Presented with spiritual devotion by Christian Life Community (CLC) Velappaya.*

---

## 🌟 Project Overview

**അമ്മയോടൊപ്പം** (*"With Mother Mary"*) is a production-ready devotional web application built for **CLC Velappaya** to track and dedicate a collective spiritual offering of exactly **100,000 Hail Marys** in honor of Our Blessed Mother Mary.

The application features a Marian celestial blue and white visual design, Malayalam devotional title, church bell sound feedback, daily Rosary Mystery meditations, and a live shared counter backed by an authoritative persistent database.

---

## 🏗️ Architecture

```text
                  PUBLIC USERS
                       │
                       ▼
                 VERCEL FRONTEND
             (Vanilla HTML / CSS / JS)
                       │
                       ▼
                 VERCEL SERVERLESS API
             (/api/prayers, /api/admin/*)
                       │
                       ▼
               HOSTED DATABASE (PostgreSQL)
               Neon / Supabase / Vercel Postgres
          (or local persistent store in development)
                       │
                       ▼
             AUTHORITATIVE CAMPAIGN STATE
```

- **Frontend**: Lightweight, high-performance HTML5, Vanilla JavaScript, Tailwind CSS (Marian palette), Font Awesome 6, and Web Audio API bell synthesis.
- **Backend / API**: Vercel Serverless Functions in Node.js (`api/` directory) with transactional row locking, rate limiting, and Asia/Kolkata timezone support.
- **Database**: PostgreSQL (e.g. Neon, Supabase, Vercel Postgres) via `DATABASE_URL` with automatic schema initialization and ACID-compliant transaction safety, plus zero-config local persistent storage for offline development.
- **Admin Security**: HMAC-SHA256 authenticated sessions with HttpOnly cookies, expiring tokens, and audit event logging.

---

## 📂 Project Structure

```text
ammayodoppam/
├── api/                        # Vercel Serverless API Endpoints
│   ├── prayers.js              # GET /api/prayers, POST /api/prayers
│   └── admin/
│       ├── login.js            # POST /api/admin/login
│       ├── logout.js           # POST /api/admin/logout
│       ├── data.js             # GET /api/admin/data
│       ├── override.js         # POST /api/admin/override
│       ├── reset.js            # POST /api/admin/reset
│       ├── entry.js            # DELETE /api/admin/entry?id=...
│       └── entry/
│           └── [id].js         # DELETE /api/admin/entry/[id]
│
├── lib/                        # Core Application Modules
│   ├── db.js                   # PostgreSQL & local storage abstraction with transactions
│   ├── auth.js                 # HMAC session signing & credential verification
│   ├── rate-limit.js           # Sliding window IP-based rate limiting
│   └── utils.js                # Asia/Kolkata timezone dates & input validation
│
├── test/                       # Automated Test Suites
│   ├── suite.js                # 20-point business logic and concurrency tests
│   └── e2e.js                  # Static asset & DOM integrity verification
│
├── index.html                  # Public Devotional Campaign Page
├── admin.html                  # Admin Management & Audit Dashboard
├── app.js                      # Public Client Script (Polling, Audio, UI)
├── style.css                   # Marian Devotional Styling (Glassmorphism, Animations)
├── server.js                   # Local Node.js Development Server
├── package.json                # Node dependencies and npm scripts
├── vercel.json                 # Vercel deployment configuration & security headers
├── .env.example                # Template for environment configuration
├── .gitignore                  # Git ignore rules for secrets and dependencies
├── START_SERVER.bat            # Windows 1-Click Launch Script
└── README.md                   # Complete documentation
```

---

## 📊 Database Schema

When connecting to PostgreSQL, the application automatically initializes the following tables on startup:

### 1. `campaign`
| Field | Type | Description |
|---|---|---|
| `id` | `INT PRIMARY KEY` | Singleton campaign row (id = 1) |
| `target_count` | `INT NOT NULL DEFAULT 100000` | Target ceiling (100,000) |
| `total_count` | `INT NOT NULL DEFAULT 0` | Authoritative total credited prayers |
| `today_count` | `INT NOT NULL DEFAULT 0` | Authoritative credited prayers today |
| `last_date` | `VARCHAR(10)` | Date string (`YYYY-MM-DD`) in `Asia/Kolkata` |
| `created_at` | `TIMESTAMP` | Row creation timestamp |
| `updated_at` | `TIMESTAMP` | Last updated timestamp |

### 2. `submissions`
| Field | Type | Description |
|---|---|---|
| `id` | `BIGINT PRIMARY KEY` | Unique timestamp identifier |
| `submitted_amount` | `INT NOT NULL` | Raw amount submitted by user |
| `credited_amount` | `INT NOT NULL` | Amount actually credited towards the 100,000 goal |
| `date` | `VARCHAR(10)` | Date in `Asia/Kolkata` |
| `time_str` | `VARCHAR(30)` | Formatted time string (e.g. `08:30 PM`) |
| `source` | `VARCHAR(50)` | Client IP / source channel |
| `status` | `VARCHAR(50)` | `completed`, `partial_target_reached`, `target_reached` |
| `created_at` | `TIMESTAMP` | Submission timestamp |

### 3. `admin_events`
| Field | Type | Description |
|---|---|---|
| `id` | `BIGINT PRIMARY KEY` | Unique event timestamp |
| `action` | `VARCHAR(50)` | `override_total`, `reset_campaign`, `delete_submission` |
| `old_value` | `TEXT` | State before modification |
| `new_value` | `TEXT` | State after modification |
| `reason` | `TEXT` | Reason provided by the administrator |
| `admin_identifier` | `VARCHAR(100)` | Username of administrator |
| `created_at` | `TIMESTAMP` | Event timestamp |

---

## 🎯 Core Business Logic Rules

### 1. The 100,000 Maximum Cap
The global counter **never exceeds 100,000**.
- If current total = `99,950` and user submits `100`:
  - `submittedAmount` = `100`
  - `creditedAmount` = `50`
  - `newTotal` = `100,000`
  - `todayCount` increases by `50`.
- If current total = `100,000` and user submits `100`:
  - `submittedAmount` = `100`
  - `creditedAmount` = `0`
  - `newTotal` = `100,000`
  - `todayCount` increases by `0`.
  - User receives a clear, friendly notification: *"The 100,000 prayer goal has already been reached. No additional prayers were added to the campaign total."*

### 2. Daily Count & Rollover
- `todayCount` tracks actual **credited** prayers today (not raw rejected submissions).
- Daily rollover uses the **`Asia/Kolkata` (IST)** timezone across all environments.

### 3. Transaction Safety & Concurrency
All prayer submissions, overrides, resets, and deletions run inside ACID database transactions using row-level locking (`SELECT ... FOR UPDATE` in PostgreSQL or mutex-locked atomic disk writes locally), preventing race conditions and lost updates.

---

## 🔒 Security & Admin Features

- **No Hardcoded Credentials**: Credentials are read from environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`).
- **Session Security**: Admin sessions use HMAC-SHA256 signed tokens stored in `HttpOnly`, `SameSite=Lax` cookies with automatic 24-hour expiration.
- **Admin Deletion**: When an administrator deletes a submission, the system subtracts only the **credited amount** from the total (and today's count if submitted today) and records the event in the audit log.
- **Admin Override**: Setting an exact total requires entering a reason and logs an audit trail event.
- **Rate Limiting**: Public endpoints enforce sliding-window IP rate limiting to prevent automated spam.

---

## 🚀 Local Development Setup

### 1. Prerequisites
- Node.js 18+ installed (`node -v`)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/chrisbin-baju/Hail-Mary.git
cd ammayodoppam
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` as needed (optional for local development, as local persistent storage works out-of-the-box).

### 4. Start Development Server
```bash
npm run dev
```
Or double-click `START_SERVER.bat` on Windows.

- Public Site: `http://localhost:8000/`
- Admin Panel: `http://localhost:8000/admin.html` (Default: `admin` / `clcvelappaya2024`)

### 5. Run Automated Tests
```bash
npm test
node test/e2e.js
```

---

## ☁️ Production Deployment on Vercel

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Production-readiness upgrade: Vercel serverless API, PostgreSQL transactions, and secure admin"
git push origin main
```

### Step 2: Import into Vercel
1. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Select your GitHub repository (`Hail-Mary`).
3. Set Framework Preset to **Other**.
4. Root Directory: `./` (or directory where `index.html` resides).

### Step 3: Configure Environment Variables in Vercel
Under **Settings -> Environment Variables**, add:
- `DATABASE_URL`: Your hosted PostgreSQL connection string (e.g., from Neon, Supabase, Vercel Postgres, or Railway)
- `ADMIN_USERNAME`: Your custom admin username
- `ADMIN_PASSWORD`: A strong secret password
- `SESSION_SECRET`: A 32+ character random string

### Step 4: Deploy
Click **Deploy**. Your site will be live at:
- Public: `https://your-project.vercel.app/`
- Admin: `https://your-project.vercel.app/admin.html`

---

## 🔔 Testing Multi-Device Real-Time Sync

1. Open `https://your-project.vercel.app/` on Device / Browser A.
2. Open `https://your-project.vercel.app/` on Device / Browser B.
3. Submit 50 prayers from Browser A.
4. Within 5 seconds, Browser B automatically updates and displays the new shared total.

---

## 📜 License & Credits

- **Campaign Identity**: CLC Velappaya (Christian Life Community)
- **Title**: അമ്മയോടൊപ്പം (100,000 Hail Marys Devotional Offering)
