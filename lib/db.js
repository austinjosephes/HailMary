/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * Database abstraction layer supporting PostgreSQL (hosted Neon/Supabase/Vercel Postgres)
 * and zero-config local persistent storage with ACID-like atomic transactions.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { TARGET_GOAL, getKolkataDateString, getKolkataTimeString } = require('./utils');

const DATA_FILE = path.join(__dirname, '..', 'prayers_data.json');

// Detect Vercel or production environment
function isProductionEnv() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
}

// Preserve pool across warm serverless invocations
let pgPool = globalThis.__ammayodoppam_pg_pool || null;
let isInitialized = Boolean(globalThis.__ammayodoppam_is_initialized);

// In-process transaction lock for local filesystem mode to prevent race conditions
let localLockPromise = Promise.resolve();
function acquireLocalLock() {
  let release;
  const lock = new Promise(resolve => { release = resolve; });
  const wait = localLockPromise.then(() => release);
  localLockPromise = localLockPromise.then(() => lock);
  return wait;
}

/**
 * Initialize Database
 * - In Production/Vercel: DATABASE_URL is strictly required. No silent fallback to local file is permitted.
 * - When DATABASE_URL is provided: Connects to PostgreSQL. If connection fails, throws an error immediately.
 * - In Local Development without DATABASE_URL: Uses local persistent store.
 */
async function getDb() {
  const isProd = isProductionEnv();
  const databaseUrl = process.env.DATABASE_URL;

  // Rule 2 & 3: Production/Vercel strictly requires DATABASE_URL.
  if (isProd && !databaseUrl) {
    throw new Error(
      'SERVER CONFIGURATION ERROR: DATABASE_URL environment variable is required in production / Vercel. ' +
      'Local file fallback is strictly forbidden in production.'
    );
  }

  if (isInitialized && pgPool) {
    return pgPool;
  }

  if (databaseUrl) {
    try {
      const isLocalhost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
      const pool = new Pool({
        connectionString: databaseUrl,
        ssl: isLocalhost ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });

      // Verify connection & create schema if not exists
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS campaign (
            id INT PRIMARY KEY DEFAULT 1,
            target_count INT NOT NULL DEFAULT 100000 CHECK (target_count = 100000),
            total_count INT NOT NULL DEFAULT 0 CHECK (total_count >= 0 AND total_count <= 100000),
            today_count INT NOT NULL DEFAULT 0 CHECK (today_count >= 0),
            last_date VARCHAR(10) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS submissions (
            id BIGINT PRIMARY KEY,
            submitted_amount INT NOT NULL,
            credited_amount INT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            date VARCHAR(10) NOT NULL,
            time_str VARCHAR(30) NOT NULL,
            source VARCHAR(50) DEFAULT 'web',
            status VARCHAR(50) DEFAULT 'completed'
          );

          CREATE TABLE IF NOT EXISTS admin_events (
            id BIGINT PRIMARY KEY,
            action VARCHAR(50) NOT NULL,
            old_value TEXT,
            new_value TEXT,
            reason TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            admin_identifier VARCHAR(100)
          );
        `);

        // Check if initial row in campaign exists
        const res = await client.query('SELECT * FROM campaign WHERE id = 1');
        if (res.rows.length === 0) {
          const today = getKolkataDateString();
          let initialTotal = 0;
          let initialToday = 0;

          // Migrate existing prayers_data.json if present
          if (fs.existsSync(DATA_FILE)) {
            try {
              const fileData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
              initialTotal = Math.min(TARGET_GOAL, Math.max(0, Number(fileData.totalCount) || 0));
              initialToday = fileData.lastDateStr === today ? (Number(fileData.todayCount) || 0) : 0;
            } catch {}
          }

          await client.query(
            `INSERT INTO campaign (id, target_count, total_count, today_count, last_date)
             VALUES (1, $1, $2, $3, $4)
             ON CONFLICT (id) DO NOTHING`,
            [TARGET_GOAL, initialTotal, initialToday, today]
          );
        }
      } finally {
        client.release();
      }

      pgPool = pool;
      globalThis.__ammayodoppam_pg_pool = pool;
      isInitialized = true;
      globalThis.__ammayodoppam_is_initialized = true;

      console.log('✅ Connected to PostgreSQL Database');
      return pgPool;
    } catch (err) {
      pgPool = null;
      isInitialized = false;
      globalThis.__ammayodoppam_pg_pool = null;
      globalThis.__ammayodoppam_is_initialized = false;
      // Rule 1 & 2: When DATABASE_URL is present, NEVER silently fall back! Always throw!
      throw new Error(`DATABASE CONNECTION ERROR: Failed to connect to PostgreSQL (${err.message}). Local fallback is disabled when DATABASE_URL is provided.`);
    }
  }

  // Local storage initialization (ONLY when not production and DATABASE_URL is absent)
  if (isProd) {
    throw new Error('SERVER CONFIGURATION ERROR: Local file storage is forbidden in production.');
  }

  initLocalStore();
  isInitialized = true;
  return null;
}

// ─── Local JSON Store Helpers (Development Only) ─────────────────────────────
function initLocalStore() {
  const today = getKolkataDateString();
  if (!fs.existsSync(DATA_FILE)) {
    const defaultData = {
      targetCount: TARGET_GOAL,
      totalCount: 0,
      todayCount: 0,
      lastDateStr: today,
      history: [],
      adminEvents: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      let modified = false;
      if (!data.targetCount) { data.targetCount = TARGET_GOAL; modified = true; }
      if (!Array.isArray(data.adminEvents)) { data.adminEvents = []; modified = true; }
      if (!Array.isArray(data.history)) { data.history = []; modified = true; }
      if (data.lastDateStr !== today) {
        data.todayCount = 0;
        data.lastDateStr = today;
        modified = true;
      }
      if (modified) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
      }
    } catch {
      const defaultData = {
        targetCount: TARGET_GOAL,
        totalCount: 0,
        todayCount: 0,
        lastDateStr: today,
        history: [],
        adminEvents: []
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
    }
  }
}

function readLocalData() {
  initLocalStore();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeLocalData(data) {
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempFile, DATA_FILE);
}

// ─── Core Database Operations ────────────────────────────────────────────────

/**
 * Get public campaign data
 */
async function getPublicCampaignData() {
  await getDb();
  const today = getKolkataDateString();

  if (pgPool) {
    const client = await pgPool.connect();
    try {
      let res = await client.query('SELECT * FROM campaign WHERE id = 1');
      if (res.rows.length === 0) {
        await client.query(
          'INSERT INTO campaign (id, target_count, total_count, today_count, last_date) VALUES (1, $1, 0, 0, $2) ON CONFLICT (id) DO NOTHING',
          [TARGET_GOAL, today]
        );
        res = await client.query('SELECT * FROM campaign WHERE id = 1');
      }
      const campaign = res.rows[0];

      // Daily rollover check
      if (campaign.last_date !== today) {
        await client.query('UPDATE campaign SET today_count = 0, last_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [today]);
        campaign.today_count = 0;
        campaign.last_date = today;
      }

      const historyRes = await client.query(
        'SELECT id, submitted_amount, credited_amount, date, time_str, created_at, status FROM submissions ORDER BY id DESC LIMIT 20'
      );

      const totalCount = Number(campaign.total_count) || 0;
      const todayCount = Number(campaign.today_count) || 0;
      const targetCount = Number(campaign.target_count) || TARGET_GOAL;
      const remainingCount = Math.max(0, targetCount - totalCount);
      const progressPercent = totalCount >= targetCount ? 100 : parseFloat(((totalCount / targetCount) * 100).toFixed(3));

      const history = historyRes.rows.map(r => ({
        id: Number(r.id),
        amount: Number(r.credited_amount),
        submittedAmount: Number(r.submitted_amount),
        creditedAmount: Number(r.credited_amount),
        date: r.date,
        time: r.time_str,
        status: r.status
      }));

      return {
        totalCount,
        todayCount,
        targetCount,
        remainingCount,
        progressPercent,
        lastDateStr: campaign.last_date,
        history
      };
    } finally {
      client.release();
    }
  }

  if (isProductionEnv()) {
    throw new Error('SERVER CONFIGURATION ERROR: PostgreSQL connection required in production.');
  }

  // Local file storage (Development Only)
  const releaseLock = await acquireLocalLock();
  try {
    const data = readLocalData();
    if (data.lastDateStr !== today) {
      data.todayCount = 0;
      data.lastDateStr = today;
      writeLocalData(data);
    }

    const totalCount = Number(data.totalCount) || 0;
    const todayCount = Number(data.todayCount) || 0;
    const targetCount = Number(data.targetCount) || TARGET_GOAL;
    const remainingCount = Math.max(0, targetCount - totalCount);
    const progressPercent = totalCount >= targetCount ? 100 : parseFloat(((totalCount / targetCount) * 100).toFixed(3));

    const history = (data.history || []).slice(0, 20).map(item => ({
      id: Number(item.id),
      amount: Number(item.creditedAmount !== undefined ? item.creditedAmount : item.amount),
      submittedAmount: Number(item.submittedAmount !== undefined ? item.submittedAmount : item.amount),
      creditedAmount: Number(item.creditedAmount !== undefined ? item.creditedAmount : item.amount),
      date: item.date || today,
      time: item.time || getKolkataTimeString(),
      status: item.status || 'completed'
    }));

    return {
      totalCount,
      todayCount,
      targetCount,
      remainingCount,
      progressPercent,
      lastDateStr: data.lastDateStr,
      history
    };
  } finally {
    releaseLock();
  }
}

/**
 * Submit prayers atomically
 */
async function submitPrayers(submittedAmount, clientIp = 'web') {
  await getDb();
  const today = getKolkataDateString();
  const timeStr = getKolkataTimeString();
  const submissionId = Date.now();

  if (pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      // Lock campaign row for update
      let res = await client.query('SELECT * FROM campaign WHERE id = 1 FOR UPDATE');
      if (res.rows.length === 0) {
        await client.query(
          'INSERT INTO campaign (id, target_count, total_count, today_count, last_date) VALUES (1, $1, 0, 0, $2) ON CONFLICT (id) DO NOTHING',
          [TARGET_GOAL, today]
        );
        res = await client.query('SELECT * FROM campaign WHERE id = 1 FOR UPDATE');
      }

      const campaign = res.rows[0];
      let currentTotal = Number(campaign.total_count) || 0;
      let currentToday = Number(campaign.today_count) || 0;

      if (campaign.last_date !== today) {
        currentToday = 0;
      }

      const remaining = Math.max(0, TARGET_GOAL - currentTotal);
      const creditedAmount = Math.max(0, Math.min(submittedAmount, remaining));
      const newTotal = currentTotal + creditedAmount;
      const newToday = currentToday + creditedAmount;

      let status = 'completed';
      if (creditedAmount === 0) {
        status = 'target_reached';
      } else if (creditedAmount < submittedAmount) {
        status = 'partial_target_reached';
      }

      // Update campaign
      await client.query(
        `UPDATE campaign 
         SET total_count = $1, today_count = $2, last_date = $3, updated_at = CURRENT_TIMESTAMP 
         WHERE id = 1`,
        [newTotal, newToday, today]
      );

      // Insert submission record
      await client.query(
        `INSERT INTO submissions (id, submitted_amount, credited_amount, date, time_str, source, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [submissionId, submittedAmount, creditedAmount, today, timeStr, clientIp, status]
      );

      await client.query('COMMIT');

      const remainingCount = Math.max(0, TARGET_GOAL - newTotal);
      const progressPercent = newTotal >= TARGET_GOAL ? 100 : parseFloat(((newTotal / TARGET_GOAL) * 100).toFixed(3));

      return {
        success: true,
        submissionId,
        submittedAmount,
        creditedAmount,
        totalCount: newTotal,
        todayCount: newToday,
        targetCount: TARGET_GOAL,
        remainingCount,
        progressPercent,
        lastDateStr: today,
        targetReached: newTotal >= TARGET_GOAL,
        isGoalFull: creditedAmount === 0 && submittedAmount > 0
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  if (isProductionEnv()) {
    throw new Error('SERVER CONFIGURATION ERROR: PostgreSQL connection required in production.');
  }

  // Local filesystem transactional storage (Development Only)
  const releaseLock = await acquireLocalLock();
  try {
    const data = readLocalData();
    if (data.lastDateStr !== today) {
      data.todayCount = 0;
      data.lastDateStr = today;
    }

    const currentTotal = Number(data.totalCount) || 0;
    const currentToday = Number(data.todayCount) || 0;
    const remaining = Math.max(0, TARGET_GOAL - currentTotal);
    const creditedAmount = Math.max(0, Math.min(submittedAmount, remaining));
    const newTotal = currentTotal + creditedAmount;
    const newToday = currentToday + creditedAmount;

    let status = 'completed';
    if (creditedAmount === 0) {
      status = 'target_reached';
    } else if (creditedAmount < submittedAmount) {
      status = 'partial_target_reached';
    }

    const entry = {
      id: submissionId,
      amount: creditedAmount,
      submittedAmount,
      creditedAmount,
      date: today,
      time: timeStr,
      status
    };

    data.totalCount = newTotal;
    data.todayCount = newToday;
    data.lastDateStr = today;
    if (!Array.isArray(data.history)) data.history = [];
    data.history.unshift(entry);
    if (data.history.length > 200) data.history = data.history.slice(0, 200);

    writeLocalData(data);

    const remainingCount = Math.max(0, TARGET_GOAL - newTotal);
    const progressPercent = newTotal >= TARGET_GOAL ? 100 : parseFloat(((newTotal / TARGET_GOAL) * 100).toFixed(3));

    return {
      success: true,
      submissionId,
      submittedAmount,
      creditedAmount,
      totalCount: newTotal,
      todayCount: newToday,
      targetCount: TARGET_GOAL,
      remainingCount,
      progressPercent,
      lastDateStr: today,
      targetReached: newTotal >= TARGET_GOAL,
      isGoalFull: creditedAmount === 0 && submittedAmount > 0
    };
  } finally {
    releaseLock();
  }
}

/**
 * Get full data for Admin Panel
 */
async function getAdminData() {
  await getDb();
  const publicData = await getPublicCampaignData();

  if (pgPool) {
    const client = await pgPool.connect();
    try {
      const allSubmissionsRes = await client.query(
        'SELECT id, submitted_amount, credited_amount, date, time_str, created_at, status FROM submissions ORDER BY id DESC LIMIT 100'
      );
      const eventsRes = await client.query(
        'SELECT id, action, old_value, new_value, reason, created_at, admin_identifier FROM admin_events ORDER BY id DESC LIMIT 50'
      );

      return {
        ...publicData,
        history: allSubmissionsRes.rows.map(r => ({
          id: Number(r.id),
          amount: Number(r.credited_amount),
          submittedAmount: Number(r.submitted_amount),
          creditedAmount: Number(r.credited_amount),
          date: r.date,
          time: r.time_str,
          status: r.status
        })),
        adminEvents: eventsRes.rows.map(e => ({
          id: Number(e.id),
          action: e.action,
          oldValue: e.old_value,
          newValue: e.new_value,
          reason: e.reason,
          createdAt: e.created_at,
          admin: e.admin_identifier
        }))
      };
    } finally {
      client.release();
    }
  }

  if (isProductionEnv()) {
    throw new Error('SERVER CONFIGURATION ERROR: PostgreSQL connection required in production.');
  }

  // Local filesystem (Development Only)
  const releaseLock = await acquireLocalLock();
  try {
    const data = readLocalData();
    return {
      ...publicData,
      history: (data.history || []).slice(0, 100).map(item => ({
        id: Number(item.id),
        amount: Number(item.creditedAmount !== undefined ? item.creditedAmount : item.amount),
        submittedAmount: Number(item.submittedAmount !== undefined ? item.submittedAmount : item.amount),
        creditedAmount: Number(item.creditedAmount !== undefined ? item.creditedAmount : item.amount),
        date: item.date || getKolkataDateString(),
        time: item.time || getKolkataTimeString(),
        status: item.status || 'completed'
      })),
      adminEvents: data.adminEvents || []
    };
  } finally {
    releaseLock();
  }
}

/**
 * Admin override of total count
 */
async function adminOverrideTotal(newTotal, reason = 'Admin manual adjustment', adminUser = 'admin') {
  await getDb();
  newTotal = Math.max(0, Math.min(TARGET_GOAL, parseInt(newTotal, 10) || 0));
  const eventId = Date.now();

  if (pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT total_count FROM campaign WHERE id = 1 FOR UPDATE');
      const oldTotal = cur.rows[0]?.total_count || 0;

      await client.query('UPDATE campaign SET total_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [newTotal]);
      await client.query(
        `INSERT INTO admin_events (id, action, old_value, new_value, reason, admin_identifier)
         VALUES ($1, 'override_total', $2, $3, $4, $5)`,
        [eventId, String(oldTotal), String(newTotal), reason, adminUser]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    if (isProductionEnv()) {
      throw new Error('SERVER CONFIGURATION ERROR: PostgreSQL connection required in production.');
    }
    const releaseLock = await acquireLocalLock();
    try {
      const data = readLocalData();
      const oldTotal = data.totalCount || 0;
      data.totalCount = newTotal;
      if (!Array.isArray(data.adminEvents)) data.adminEvents = [];
      data.adminEvents.unshift({
        id: eventId,
        action: 'override_total',
        oldValue: String(oldTotal),
        newValue: String(newTotal),
        reason,
        admin: adminUser,
        createdAt: new Date().toISOString()
      });
      writeLocalData(data);
    } finally {
      releaseLock();
    }
  }

  return getAdminData();
}

/**
 * Admin reset campaign
 */
async function adminResetCampaign(reason = 'Admin requested campaign reset', adminUser = 'admin') {
  await getDb();
  const eventId = Date.now();
  const today = getKolkataDateString();

  if (pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT total_count, today_count FROM campaign WHERE id = 1 FOR UPDATE');
      const oldVal = JSON.stringify(cur.rows[0] || {});

      await client.query('UPDATE campaign SET total_count = 0, today_count = 0, last_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [today]);
      await client.query(
        `INSERT INTO admin_events (id, action, old_value, new_value, reason, admin_identifier)
         VALUES ($1, 'reset_campaign', $2, '{"total_count":0,"today_count":0}', $3, $4)`,
        [eventId, oldVal, reason, adminUser]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    if (isProductionEnv()) {
      throw new Error('SERVER CONFIGURATION ERROR: PostgreSQL connection required in production.');
    }
    const releaseLock = await acquireLocalLock();
    try {
      const data = readLocalData();
      const oldVal = JSON.stringify({ totalCount: data.totalCount, todayCount: data.todayCount });
      data.totalCount = 0;
      data.todayCount = 0;
      data.lastDateStr = today;
      if (!Array.isArray(data.adminEvents)) data.adminEvents = [];
      data.adminEvents.unshift({
        id: eventId,
        action: 'reset_campaign',
        oldValue: oldVal,
        newValue: '{"totalCount":0,"todayCount":0}',
        reason,
        admin: adminUser,
        createdAt: new Date().toISOString()
      });
      writeLocalData(data);
    } finally {
      releaseLock();
    }
  }

  return getAdminData();
}

/**
 * Admin delete a submission entry
 * Reverses only creditedAmount from totalCount, and adjusts todayCount if submitted today
 */
async function adminDeleteSubmission(submissionId, adminUser = 'admin') {
  await getDb();
  const idNum = Number(submissionId);
  const today = getKolkataDateString();
  const eventId = Date.now();

  if (pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const subRes = await client.query('SELECT * FROM submissions WHERE id = $1 FOR UPDATE', [idNum]);
      if (subRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, notFound: true };
      }

      const sub = subRes.rows[0];
      const creditedToReverse = Number(sub.credited_amount) || 0;
      const isToday = sub.date === today;

      const campRes = await client.query('SELECT * FROM campaign WHERE id = 1 FOR UPDATE');
      const camp = campRes.rows[0];
      const newTotal = Math.max(0, (Number(camp.total_count) || 0) - creditedToReverse);
      const newToday = isToday ? Math.max(0, (Number(camp.today_count) || 0) - creditedToReverse) : Number(camp.today_count) || 0;

      await client.query('UPDATE campaign SET total_count = $1, today_count = $2, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [newTotal, newToday]);
      await client.query('DELETE FROM submissions WHERE id = $1', [idNum]);
      await client.query(
        `INSERT INTO admin_events (id, action, old_value, new_value, reason, admin_identifier)
         VALUES ($1, 'delete_submission', $2, $3, $4, $5)`,
        [
          eventId,
          JSON.stringify(sub),
          `Reversed ${creditedToReverse} prayers from total`,
          `Deleted submission #${idNum}`,
          adminUser
        ]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    if (isProductionEnv()) {
      throw new Error('SERVER CONFIGURATION ERROR: PostgreSQL connection required in production.');
    }
    const releaseLock = await acquireLocalLock();
    try {
      const data = readLocalData();
      const history = data.history || [];
      const entryIdx = history.findIndex(e => Number(e.id) === idNum);

      if (entryIdx === -1) {
        return { success: false, notFound: true };
      }

      const sub = history[entryIdx];
      const creditedToReverse = Number(sub.creditedAmount !== undefined ? sub.creditedAmount : sub.amount) || 0;
      const isToday = (sub.date || data.lastDateStr) === today;

      data.totalCount = Math.max(0, (Number(data.totalCount) || 0) - creditedToReverse);
      if (isToday) {
        data.todayCount = Math.max(0, (Number(data.todayCount) || 0) - creditedToReverse);
      }

      history.splice(entryIdx, 1);
      data.history = history;

      if (!Array.isArray(data.adminEvents)) data.adminEvents = [];
      data.adminEvents.unshift({
        id: eventId,
        action: 'delete_submission',
        oldValue: JSON.stringify(sub),
        newValue: `Reversed ${creditedToReverse} prayers from total`,
        reason: `Deleted submission #${idNum}`,
        admin: adminUser,
        createdAt: new Date().toISOString()
      });

      writeLocalData(data);
    } finally {
      releaseLock();
    }
  }

  const updatedData = await getAdminData();
  return { success: true, ...updatedData };
}

module.exports = {
  getDb,
  isProductionEnv,
  getPublicCampaignData,
  submitPrayers,
  getAdminData,
  adminOverrideTotal,
  adminResetCampaign,
  adminDeleteSubmission
};
