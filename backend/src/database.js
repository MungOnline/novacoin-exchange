/**
 * NovaCoin Database Layer
 * 
 * Supports both SQLite (local dev) and PostgreSQL (Neon production).
 * Auto-detects mode from DATABASE_URL environment variable.
 * 
 * API is async throughout — callers always await prepare(...).run/get/all().
 * In SQLite mode the underlying calls are sync but wrapped for interface consistency.
 */

const path = require('path');
const fs = require('fs');

// ─── Mode Detection ───────────────────────────────────────────────────────────
const IS_POSTGRES = !!process.env.DATABASE_URL;
const DB_PATH = process.env.DB_PATH || './data/novacoin.db';

// ─── Placeholder / SQL Conversion (PostgreSQL) ────────────────────────────────
let pgCounter = 0;

/**
 * Convert SQLite SQL to PostgreSQL-compatible SQL.
 * Replaces:
 *   - ?  → $1, $2, $3 …  (positional)
 *   - datetime('now') / datetime("now") → NOW()
 *   - datetime('now', '±N unit') → NOW() ± INTERVAL 'N unit'
 *   - date('now') → CURRENT_DATE
 *   - INSERT OR REPLACE INTO settings … → INSERT … ON CONFLICT (key) DO UPDATE
 *   - INSERT OR IGNORE INTO settings …  → INSERT … ON CONFLICT (key) DO NOTHING
 */
function pgify(sql) {
  pgCounter = 0;

  // 1. Replace ? placeholders with $N
  sql = sql.replace(/\?/g, () => `$${++pgCounter}`);

  // 2. Replace datetime('now', '±N unit') → NOW() ± INTERVAL 'N unit'
  sql = sql.replace(
    /datetime\(['"](now)['"]\s*,\s*['"](-?\d+\s+\w+(?:\s+\w+)?)['"]\)/gi,
    (_m, _now, interval) => `NOW() - INTERVAL '${interval.replace(/^-/, '')}'`
  );
  // Handle the case where INTERVAL uses a leading - (our regex above strips it).
  // Actually the regex captures -?\d+ so if the interval text has a leading minus
  // it's already part of the capture.  But SQLite syntax is datetime('now','-1 day')
  // and pg is NOW() - INTERVAL '1 day'.  So we strip the leading - and use - in SQL.
  // Let me redo this more carefully.
  // Actually let me just do simpler manual replacements for known patterns.

  // Redo from scratch for datetime/date patterns:
  return convertDateAndDML(sql);
}

function convertDateAndDML(sql) {
  // First re-map ? → $N (already done in pgify, but we need to be careful)
  // Actually pgify calls this, so let me just do everything here.

  // 1. ? → $N
  let idx = 0;
  sql = sql.replace(/\?/g, () => `$${++idx}`);

  // 2a. datetime('now', '-N unit')
  sql = sql.replace(
    /datetime\(\s*['"]now['"]\s*,\s*['"]-(\d+)\s+(day|days|hour|hours)['"]\s*\)/gi,
    (_m, num, unit) => {
      if (unit.startsWith('day')) return `NOW() - INTERVAL '${num} days'`;
      return `NOW() - INTERVAL '${num} hours'`;
    }
  );
  // 2b. datetime('now', '+N unit') (unused but for completeness)
  sql = sql.replace(
    /datetime\(\s*['"]now['"]\s*,\s*['"]\+(\d+)\s+(day|days|hour|hours)['"]\s*\)/gi,
    (_m, num, unit) => {
      if (unit.startsWith('day')) return `NOW() + INTERVAL '${num} days'`;
      return `NOW() + INTERVAL '${num} hours'`;
    }
  );
  // 2c. datetime('now') or datetime("now")
  sql = sql.replace(/datetime\(\s*['"]now['"]\s*\)/gi, 'NOW()');

  // 3. date('now') → CURRENT_DATE
  sql = sql.replace(/date\(\s*['"]now['"]\s*\)/gi, 'CURRENT_DATE');

  // 4. INSERT OR REPLACE INTO settings (...) VALUES (...) ON CONFLICT (key) DO UPDATE
  sql = sql.replace(
    /INSERT\s+OR\s+REPLACE\s+INTO\s+(settings)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi,
    (_m, table, columns, values) => {
      const cols = columns.split(',').map(c => c.trim());
      const vals = values.split(',').map(v => v.trim());
      // Build SET clause for all columns except 'key' (the conflict target)
      const updates = cols
        .filter(c => c.toLowerCase() !== 'key')
        .map((c, i) => `${c} = ${vals[i]}`);
      // If key is the only column or we filtered everything, keep at least value/updated_at
      const setClause = updates.length > 0
        ? updates.join(', ')
        : cols.map((c, i) => `${c} = ${vals[i]}`).join(', ');
      return `INSERT INTO ${table} (${columns}) VALUES (${values}) ON CONFLICT (key) DO UPDATE SET ${setClause}`;
    }
  );
  // 5. INSERT OR IGNORE INTO settings (...) VALUES (...) ON CONFLICT (key) DO NOTHING
  sql = sql.replace(
    /INSERT\s+OR\s+IGNORE\s+INTO\s+(settings)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi,
    (_m, table, columns, values) => {
      return `INSERT INTO ${table} (${columns}) VALUES (${values}) ON CONFLICT (key) DO NOTHING`;
    }
  );

  // 6. Various type/function adjustments (safe for table definitions)
  // REAL → DOUBLE PRECISION in CREATE TABLE
  // But only replace when it's a column type, not a value or alias
  // Actually let's handle this in the schema separately, not in the converter.

  return sql;
}

// ─── PostgreSQL Implementation ────────────────────────────────────────────────
let pgPool = null;

function getPgPool() {
  if (!pgPool) {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    pgPool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err.message);
    });
  }
  return pgPool;
}

// ─── SQLite Implementation ────────────────────────────────────────────────────
let sqliteDb = null;
let SQL = null;

function getSqliteDb() {
  if (!sqliteDb) throw new Error('Database not initialized');
  return sqliteDb;
}

// ─── Shared API ───────────────────────────────────────────────────────────────

/**
 * Prepare a SQL statement and return helpers.
 * 
 * In PostgreSQL mode every helper returns a Promise (must be awaited).
 * In SQLite mode helpers return plain values (await on non-Promise is a no-op).
 * 
 * @param {string} sql - SQL statement
 * @returns {{ run: Function, get: Function, all: Function }}
 */
function prepare(sql) {
  if (IS_POSTGRES) {
    // ── PostgreSQL (async) ──────────────────────────────────────────────
    const pgSql = pgify(sql);
    const pool = getPgPool();

    return {
      async run(...params) {
        const flat = params.flat().filter(p => p !== undefined);
        await pool.query(pgSql, flat);
      },
      async get(...params) {
        const flat = params.flat().filter(p => p !== undefined);
        const result = await pool.query(pgSql, flat);
        return result.rows[0] !== undefined ? result.rows[0] : undefined;
      },
      async all(...params) {
        const flat = params.flat().filter(p => p !== undefined);
        const result = await pool.query(pgSql, flat);
        return result.rows;
      },
    };
  } else {
    // ── SQLite (sync, but returns plain values so await is safe) ────────
    const db = getSqliteDb();
    const stmt = db.prepare(sql);
    return {
      run(...params) {
        const flat = params.flat().filter(p => p !== undefined);
        stmt.bind(flat);
        stmt.step();
        stmt.free();
        saveDatabase();
      },
      get(...params) {
        const flat = params.flat().filter(p => p !== undefined);
        if (flat.length > 0) stmt.bind(flat);
        if (stmt.step()) {
          const result = stmt.getAsObject();
          stmt.free();
          return result;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        const results = [];
        const flat = params.flat().filter(p => p !== undefined);
        if (flat.length > 0) stmt.bind(flat);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
    };
  }
}

/**
 * Simple query helper — runs a SELECT (returns rows) or modifying SQL.
 * @param {string} sql 
 * @param  {...any} params 
 * @returns {Array|undefined}
 */
function query(sql, ...params) {
  const trimmed = sql.trim().toUpperCase();
  const isSelect =
    trimmed.startsWith('SELECT') ||
    trimmed.startsWith('WITH') ||
    trimmed.startsWith('PRAGMA') ||
    trimmed.startsWith('RETURNING');

  if (isSelect) {
    return prepare(sql).all(...params);
  } else {
    prepare(sql).run(...params);
    return undefined;
  }
}

/**
 * Save database — for SQLite persisting to disk.
 * No-op in PostgreSQL mode (auto-committed).
 */
function saveDatabase() {
  if (!IS_POSTGRES && sqliteDb) {
    const data = sqliteDb.export();
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

/**
 * Return the raw database handle.
 * SQLite: returns the sql.js Database object.
 * PostgreSQL: returns the Pool (or null if not yet connected).
 */
function getDbHandle() {
  return IS_POSTGRES ? pgPool : sqliteDb;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA_SQL = IS_POSTGRES
  ? `
-- PostgreSQL schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  google_id TEXT,
  is_admin INTEGER DEFAULT 0,
  is_banned INTEGER DEFAULT 0,
  twofa_secret TEXT,
  twofa_enabled INTEGER DEFAULT 0,
  email_verified INTEGER DEFAULT 0,
  last_login_ip TEXT,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL CHECK(currency IN ('THB', 'NVC')),
  balance DOUBLE PRECISION DEFAULT 0,
  locked DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, currency)
);

CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount DOUBLE PRECISION NOT NULL,
  fee DOUBLE PRECISION DEFAULT 0,
  slip_filename TEXT,
  bank_account TEXT,
  bank_name TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  admin_id TEXT REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK(type IN ('buy', 'sell')),
  price DOUBLE PRECISION NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  filled DOUBLE PRECISION DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'partial', 'filled', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  buy_order_id TEXT NOT NULL REFERENCES orders(id),
  sell_order_id TEXT NOT NULL REFERENCES orders(id),
  price DOUBLE PRECISION NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  total DOUBLE PRECISION NOT NULL,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  price DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION DEFAULT 0,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('verify_email', 'reset_password', 'login')),
  expires_at TIMESTAMP NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount DOUBLE PRECISION NOT NULL,
  thb_amount DOUBLE PRECISION NOT NULL,
  bank_name TEXT,
  bank_account TEXT,
  account_name TEXT,
  wallet_address TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  admin_id TEXT REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL,
  email TEXT,
  attempt_type TEXT NOT NULL DEFAULT 'login',
  success INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
`
  : `
-- SQLite schema (PRAGMA foreign_keys = ON is set at runtime)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  google_id TEXT,
  is_admin INTEGER DEFAULT 0,
  is_banned INTEGER DEFAULT 0,
  twofa_secret TEXT,
  twofa_enabled INTEGER DEFAULT 0,
  email_verified INTEGER DEFAULT 0,
  last_login_ip TEXT,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('THB', 'NVC')),
  balance REAL DEFAULT 0,
  locked REAL DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, currency)
);

CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  fee REAL DEFAULT 0,
  slip_filename TEXT,
  bank_account TEXT,
  bank_name TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  admin_id TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('buy', 'sell')),
  price REAL NOT NULL,
  amount REAL NOT NULL,
  filled REAL DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'partial', 'filled', 'cancelled')),
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  buy_order_id TEXT NOT NULL,
  sell_order_id TEXT NOT NULL,
  price REAL NOT NULL,
  amount REAL NOT NULL,
  total REAL NOT NULL,
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (buy_order_id) REFERENCES orders(id),
  FOREIGN KEY (sell_order_id) REFERENCES orders(id),
  FOREIGN KEY (buyer_id) REFERENCES users(id),
  FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price REAL NOT NULL,
  volume REAL DEFAULT 0,
  timestamp DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('verify_email', 'reset_password', 'login')),
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  thb_amount REAL NOT NULL,
  bank_name TEXT,
  bank_account TEXT,
  account_name TEXT,
  wallet_address TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  admin_id TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  email TEXT,
  attempt_type TEXT NOT NULL DEFAULT 'login',
  success INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now'))
);
`;

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize the database — create tables and seed defaults.
 * Safe to call multiple times (uses IF NOT EXISTS).
 */
async function initializeDatabase() {
  if (IS_POSTGRES) {
    // ── PostgreSQL ──────────────────────────────────────────────────────
    const pool = getPgPool();
    // Test connection
    try {
      const result = await pool.query('SELECT NOW() as time');
      console.log(`✅ Connected to PostgreSQL (Neon): ${result.rows[0].time}`);
    } catch (err) {
      console.error('❌ Failed to connect to PostgreSQL:', err.message);
      throw err;
    }

    // Create tables
    const statements = SCHEMA_SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log('✅ PostgreSQL schema created/verified.');

    // Insert default settings
    const defaultSettings = [
      ['admin_pin', '141200'],
      ['nvc_price', '0.0004546'],
      ['nvc_price_change_24h', '+0.00'],
      ['market_cap', '0'],
      ['volume_24h', '0'],
      ['total_users', '0'],
      ['deposit_bank_name', 'ธนาคารกรุงเทพ'],
      ['deposit_account_number', '123-4-56789-0'],
      ['deposit_account_name', 'บริษัท โนวา คอยน์ จำกัด'],
      ['deposit_qr_code', ''],
    ];

    for (const [key, value] of defaultSettings) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }
    console.log('✅ PostgreSQL settings seeded.');
  } else {
    // ── SQLite ───────────────────────────────────────────────────────────
    const initSqlJs = require('sql.js');
    SQL = await initSqlJs();

    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      sqliteDb = new SQL.Database(buffer);
      console.log('📂 Loaded existing SQLite database.');
    } else {
      sqliteDb = new SQL.Database();
      console.log('🆕 Created new SQLite database.');
    }

    sqliteDb.run('PRAGMA foreign_keys = ON;');

    // Create tables
    const statements = SCHEMA_SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      if (stmt.length > 0) sqliteDb.run(stmt);
    }

    // Insert default settings (using raw db.run for initial setup)
    const defaultSettings = [
      ['admin_pin', '141200'],
      ['nvc_price', '0.0004546'],
      ['nvc_price_change_24h', '+0.00'],
      ['market_cap', '0'],
      ['volume_24h', '0'],
      ['total_users', '0'],
      ['deposit_bank_name', 'ธนาคารกรุงเทพ'],
      ['deposit_account_number', '123-4-56789-0'],
      ['deposit_account_name', 'บริษัท โนวา คอยน์ จำกัด'],
      ['deposit_qr_code', ''],
    ];

    for (const [key, value] of defaultSettings) {
      sqliteDb.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }

    saveDatabase();
    console.log('✅ SQLite database initialized.');
    console.log(`   Location: ${DB_PATH}`);
  }
}

// ─── Auto-save (SQLite only) ──────────────────────────────────────────────────
if (!IS_POSTGRES) {
  setInterval(() => saveDatabase(), 30000);
  process.on('exit', () => saveDatabase());
  process.on('SIGINT', () => { saveDatabase(); process.exit(0); });
  process.on('SIGTERM', () => { saveDatabase(); process.exit(0); });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  db: getDbHandle,
  prepare,
  query,
  initializeDatabase,
  saveDatabase,
  IS_POSTGRES,
};
