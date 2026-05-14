'use strict';
/**
 * utils/state.js — ProfitEngine v4.0
 * Atomic JSON state with in-memory cache + disk persistence.
 * Audit trail for all writes. Never stores secrets.
 */
const fs   = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), 'data', 'state.json');
const AUDIT_FILE = path.join(process.cwd(), 'data', 'audit.jsonl');

let _cache = null;
let _dirty = false;
let _flushTimer = null;

const SECRET_KEYS = new Set(['key', 'secret', 'token', 'password', 'auth']);

function isSensitive(key) {
  const lk = key.toLowerCase();
  return [...SECRET_KEYS].some(s => lk.includes(s));
}

function load() {
  if (_cache) return _cache;
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    if (fs.existsSync(STATE_FILE)) {
      _cache = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } else {
      _cache = {};
    }
  } catch {
    _cache = {};
  }
  return _cache;
}

function flush() {
  if (!_dirty || !_cache) return;
  try {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_cache, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
    _dirty = false;
  } catch (err) {
    // Non-fatal — will retry on next flush
    console.error('[STATE] Flush failed:', err.message);
  }
}

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flush();
  }, 500);
}

function audit(key, value) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      key,
      value: isSensitive(key) ? '[REDACTED]' : value,
    });
    fs.appendFileSync(AUDIT_FILE, entry + '\n');
  } catch { /* non-fatal */ }
}

const state = {
  get(key, defaultVal = null) {
    const data = load();
    return key in data ? data[key] : defaultVal;
  },

  set(key, value) {
    if (isSensitive(key)) {
      throw new Error(`[STATE] Refusing to persist sensitive key: ${key}`);
    }
    const data = load();
    data[key] = value;
    _dirty = true;
    audit(key, value);
    scheduleFlush();
  },

  delete(key) {
    const data = load();
    delete data[key];
    _dirty = true;
    scheduleFlush();
  },

  getAll() {
    return { ...load() };
  },

  increment(key, by = 1) {
    const current = this.get(key, 0);
    this.set(key, current + by);
    return current + by;
  },

  push(key, value, maxLen = 500) {
    const arr = this.get(key, []);
    arr.push(value);
    if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
    this.set(key, arr);
  },

  flush,
  load,
};

// Flush on clean shutdown
process.on('SIGTERM', () => { flush(); process.exit(0); });
process.on('SIGINT',  () => { flush(); process.exit(0); });

module.exports = state;
