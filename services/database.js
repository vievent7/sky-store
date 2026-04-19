/**
 * DATABASE — SQLite via sql.js (pure JS, zero native deps)
 * ==========================================================
 * IMPORTANT: db.prepare() et db.run() sont async — utiliser await.
 * Le serveur attend initDb() avant de démarrer (voir server.js).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const SQL = require('sql.js');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH  = path.join(DATA_DIR, 'sky-store.db');

// ─── State ────────────────────────────────────────────────────────────────────

let _sqljs  = null;
let _sqlite = null;
let _ready  = false;
let _initPromise = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

async function _init() {
  if (_ready) return _initPromise;
  _initPromise = (async () => {
    _sqljs = await SQL();
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
    _sqlite = buf ? new _sqljs.Database(buf) : new _sqljs.Database();
    _createSchema();
    _ready = true;
  })();
  return _initPromise;
}

function _persist() {
  if (!_sqlite) return;
  fs.writeFileSync(DB_PATH, Buffer.from(_sqlite.export()));
}

// ─── Schema ──────────────────────────────────────────────────────────────────

function _createSchema() {
  _sqlite.run(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      email          TEXT    NOT NULL UNIQUE,
      password_hash  TEXT    NOT NULL,
      is_admin       INTEGER DEFAULT 0,
      created_at     TEXT    DEFAULT (datetime('now'))
    )
  `);
  // Migrations users
  try { _sqlite.run('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 1'); } catch (_) {}
  try { _sqlite.run('ALTER TABLE users ADD COLUMN email_verification_token TEXT'); } catch (_) {}
  try { _sqlite.run('ALTER TABLE users ADD COLUMN email_verification_expires_at TEXT'); } catch (_) {}
  try { _sqlite.run('ALTER TABLE users ADD COLUMN password_reset_token TEXT'); } catch (_) {}
  try { _sqlite.run('ALTER TABLE users ADD COLUMN password_reset_expires TEXT'); } catch (_) {}
  try { _sqlite.run("ALTER TABLE users ADD COLUMN tenant_id TEXT DEFAULT 'public'"); } catch (_) {}
  _sqlite.run("UPDATE users SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'public')");
  _sqlite.run('CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email)');
  _sqlite.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER,
      customer_email    TEXT,
      customer_name     TEXT,
      total             INTEGER NOT NULL DEFAULT 0,
      status            TEXT    NOT NULL DEFAULT 'pending',
      stripe_session_id TEXT,
      free_photo_credit INTEGER DEFAULT 0,
      tenant_id         TEXT    DEFAULT 'public',
      created_at        TEXT    DEFAULT (datetime('now'))
    )
  `);
  try { _sqlite.run("ALTER TABLE orders ADD COLUMN tenant_id TEXT DEFAULT 'public'"); } catch (_) {}
  _sqlite.run("UPDATE orders SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'public')");
  _sqlite.run('CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON orders(tenant_id, created_at)');
  _sqlite.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id       INTEGER NOT NULL,
      product_type   TEXT    NOT NULL,
      product_title  TEXT    NOT NULL,
      price          INTEGER NOT NULL DEFAULT 0,
      is_bonus       INTEGER DEFAULT 0,
      metadata       TEXT,
      created_at     TEXT    DEFAULT (datetime('now'))
    )
  `);
  _sqlite.run(`
    CREATE TABLE IF NOT EXISTS download_tokens (
      token          TEXT    PRIMARY KEY,
      order_id       INTEGER NOT NULL,
      order_item_id  INTEGER,
      user_id        INTEGER,
      product_id     TEXT,
      expires_at     TEXT    NOT NULL,
      used           INTEGER DEFAULT 0,
      created_at     TEXT    DEFAULT (datetime('now'))
    )
  `);
  _sqlite.run(`
    CREATE TABLE IF NOT EXISTS photos_meta (
      id          TEXT PRIMARY KEY,
      title       TEXT,
      description TEXT,
      price       INTEGER NOT NULL DEFAULT 5000,
      category    TEXT,
      lens        TEXT,
      location    TEXT,
      taken_at    TEXT,
      file_path   TEXT,
      thumb_path  TEXT,
      created_at  TEXT    DEFAULT (datetime('now'))
    )
  `);
  _sqlite.run(`
    CREATE TABLE IF NOT EXISTS cart (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      session_id   TEXT,
      tenant_id    TEXT    DEFAULT 'public',
      product_type TEXT,
      product_title TEXT,
      price        INTEGER NOT NULL DEFAULT 0,
      is_bonus     INTEGER DEFAULT 0,
      metadata     TEXT,
      created_at   TEXT    DEFAULT (datetime('now'))
    )
  `);

  // Migration: ajouter user_id si la colonne n'existe pas encore
  try {
    _sqlite.run('ALTER TABLE cart ADD COLUMN user_id INTEGER');
  } catch (_) { /* colonne existe déjà */ }
  try { _sqlite.run("ALTER TABLE cart ADD COLUMN tenant_id TEXT DEFAULT 'public'"); } catch (_) {}
  _sqlite.run("UPDATE cart SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'public')");
  _sqlite.run('CREATE INDEX IF NOT EXISTS idx_cart_tenant_user_session ON cart(tenant_id, user_id, session_id)');
  _sqlite.run(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT    NOT NULL,
      title       TEXT,
      description TEXT,
      price       INTEGER NOT NULL DEFAULT 0,
      metadata    TEXT,
      active      INTEGER DEFAULT 1,
      created_at  TEXT    DEFAULT (datetime('now'))
    )
  `);
  _sqlite.run(`
    CREATE TABLE IF NOT EXISTS workflow_jobs (
      id             TEXT PRIMARY KEY,
      tenant_id      TEXT    NOT NULL DEFAULT 'public',
      type           TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'queued',
      attempt_count  INTEGER NOT NULL DEFAULT 0,
      max_attempts   INTEGER NOT NULL DEFAULT 1,
      payload        TEXT,
      result         TEXT,
      correlation_id TEXT,
      last_error     TEXT,
      started_at     TEXT,
      finished_at    TEXT,
      created_at     TEXT    DEFAULT (datetime('now')),
      updated_at     TEXT    DEFAULT (datetime('now'))
    )
  `);
  _sqlite.run('CREATE INDEX IF NOT EXISTS idx_workflow_jobs_tenant_created ON workflow_jobs(tenant_id, created_at)');
  _sqlite.run('CREATE INDEX IF NOT EXISTS idx_workflow_jobs_status ON workflow_jobs(status)');
  _persist();
}

// ─── sql.js Statement wrapper ─────────────────────────────────────────────────

class Stmt {
  constructor(sqlite) {
    this._sql    = '';
    this._sqlite = sqlite;
    this._stmt   = null;
    this._params = [];
    this._row    = null;
    this._lastInsertRowid = null;
    this._changes = null;
  }

  set(sql) { this._sql = sql; return this; }

  bind(...params) { this._params = params; return this; }

  step() {
    if (!this._stmt) {
      this._stmt = this._sqlite.prepare(this._sql);
      if (this._params.length) this._stmt.bind(this._params);
    }
    const ok = this._stmt.step();
    this._row = ok ? this._stmt.getAsObject() : null;
    return ok;
  }

  get(...args) {
    if (args.length) this.bind(...args);
    this.step();
    return this._row;
  }

  all(...params) {
    const p = params.length ? params : this._params;
    const stmt = this._sqlite.prepare(this._sql);
    if (p.length) stmt.bind(p);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  run(...params) {
    const p = params.length ? params : this._params;
    const stmt = this._sqlite.prepare(this._sql);
    if (p.length) {
      stmt.run(p);
    } else {
      stmt.run();
    }
    // Capture insert/update metadata before persisting.
    const rowidStmt = this._sqlite.prepare('SELECT last_insert_rowid() as id');
    rowidStmt.step();
    this._lastInsertRowid = rowidStmt.getAsObject().id;
    rowidStmt.free();
    const changesStmt = this._sqlite.prepare('SELECT changes() as c');
    changesStmt.step();
    this._changes = changesStmt.getAsObject().c;
    changesStmt.free();
    stmt.free();
    _persist();
    return this;
  }

  free() {
    if (this._stmt) { this._stmt.free(); this._stmt = null; }
  }

  get lastInsertRowid() {
    if (this._lastInsertRowid != null) return this._lastInsertRowid;
    const stmt = this._sqlite.prepare('SELECT last_insert_rowid() as id');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return row.id;
  }

  get changes() {
    if (this._changes != null) return this._changes;
    const stmt = this._sqlite.prepare('SELECT changes() as c');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return row.c;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

// db.prepare(sql) → Promise<Stmt>
// db.run(sql, ...params) → Promise<void>
// db.exec(sql) → Promise<void>
const db = {
  get sqlite() { return _sqlite; },

  async prepare(sql) {
    await _init();
    return new Stmt(_sqlite).set(sql);
  },

  async run(sql, ...params) {
    await _init();
    const stmt = _sqlite.prepare(sql);
    if (params.length) stmt.bind(params);
    stmt.step();
    stmt.free();
    _persist();
  },

  async exec(sql) {
    await _init();
    _sqlite.exec(sql);
    _persist();
  },

  then(onFulfilled) {
    return _init().then(() => onFulfilled({ db: _sqlite, Stmt }));
  },

  // Debug: raw sql.js access (for admin scripts)
  rawSql() {
    return _sqlite;
  }
};

module.exports = { db, initDb: _init };
