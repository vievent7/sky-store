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
      created_at        TEXT    DEFAULT (datetime('now'))
    )
  `);
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
    if (p.length) stmt.bind(p);
    stmt.step();
    stmt.free();
    _persist();
    return this;
  }

  free() {
    if (this._stmt) { this._stmt.free(); this._stmt = null; }
  }

  get lastInsertRowid() {
    const stmt = this._sqlite.prepare('SELECT last_insert_rowid() as id');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return row.id;
  }

  get changes() {
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
