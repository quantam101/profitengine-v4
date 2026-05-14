'use strict';
/**
 * utils/distillation/cache.js — ProfitEngine v4.0
 * Two-level cache: hot (RAM Map) + warm (disk JSON).
 * TTL-based expiry. Thread-safe via atomic writes.
 */
const fs   = require('fs');
const path = require('path');

const CACHE_FILE = path.join(process.cwd(), 'data', 'distill_cache.json');
const hot = new Map(); // key → { value, expiresAt }
let disk = {};
let diskLoaded = false;

function loadDisk() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    if (fs.existsSync(CACHE_FILE)) {
      disk = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch { disk = {}; }
}

function saveDisk() {
  try {
    const tmp = CACHE_FILE + '.tmp';
    // Prune expired entries before saving
    const now = Date.now();
    const clean = {};
    for (const [k, v] of Object.entries(disk)) {
      if (v.expiresAt > now) clean[k] = v;
    }
    disk = clean;
    fs.writeFileSync(tmp, JSON.stringify(clean), 'utf8');
    fs.renameSync(tmp, CACHE_FILE);
  } catch { /* non-fatal */ }
}

function get(key) {
  // Check hot cache first
  const h = hot.get(key);
  if (h) {
    if (h.expiresAt > Date.now()) return h.value;
    hot.delete(key);
  }
  // Check disk
  loadDisk();
  const d = disk[key];
  if (d && d.expiresAt > Date.now()) {
    hot.set(key, d); // promote to hot
    return d.value;
  }
  return null;
}

function set(key, value, ttlSeconds = 3600) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const entry = { value, expiresAt };
  hot.set(key, entry);
  loadDisk();
  disk[key] = entry;
  saveDisk();
}

function invalidate(key) {
  hot.delete(key);
  loadDisk();
  delete disk[key];
  saveDisk();
}

function stats() {
  loadDisk();
  const now = Date.now();
  const hotActive  = [...hot.entries()].filter(([,v]) => v.expiresAt > now).length;
  const diskActive = Object.values(disk).filter(v => v.expiresAt > now).length;
  return { hotActive, diskActive };
}

module.exports = { get, set, invalidate, stats };
