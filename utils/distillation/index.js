'use strict';
/**
 * utils/distillation/index.js — ProfitEngine v4.0
 * Data Distillation Pipeline — auto-tier routing with caching.
 * Tier 0: pure local (0 tokens)
 * Tier 1: fast model (gemma2-9b)
 * Tier 2: full model (llama-3.3-70b)
 */
const cache  = require('./cache');
const llm    = require('../llm');
const logger = require('../logger');

// ── Preprocessor (Tier 0 ops) ─────────────────────────────────────────────────
function stripHtml(text) {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function dedup(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = typeof item === 'string' ? item.toLowerCase() : JSON.stringify(item).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function compressTrends(trends) {
  return trends.map(t => `${t.title}|${t.source}|${t.score||0}`).join('\n');
}
function compressPosts(posts) {
  return posts.map(p => `[${p.title}] ${(p.body||'').slice(0,200)}`).join('\n---\n');
}

// ── Tiered Router ─────────────────────────────────────────────────────────────
const ROUTES = {
  // agent → { tier, cacheKey, ttl, useFast }
  trendScore:      { tier: 2, ttl: 15*60,  useFast: false },
  extractKeywords: { tier: 1, ttl: 6*3600, useFast: true  },
  genCaption:      { tier: 1, ttl: 1*3600, useFast: true  },
  genBlogPost:     { tier: 2, ttl: 24*3600,useFast: false },
  genMerchPrompt:  { tier: 1, ttl: 24*3600,useFast: true  },
  analyzeRevenue:  { tier: 2, ttl: 6*3600, useFast: false },
  selfImprove:     { tier: 2, ttl: 24*3600,useFast: false },
  abTitle:         { tier: 1, ttl: 24*3600,useFast: true  },
};

async function run(task, prompt, cacheKey = null) {
  const route = ROUTES[task] || { tier: 2, ttl: 3600, useFast: false };

  // Check cache
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached !== null) {
      logger.debug(`[DISTILL] Cache HIT: ${task}:${cacheKey}`);
      return cached;
    }
  }

  let result;
  if (route.useFast) {
    result = await llm.callFast(prompt, null, 800);
  } else {
    result = await llm.generate(prompt, null, 1500);
  }

  if (cacheKey) {
    cache.set(cacheKey, result, route.ttl);
  }
  return result;
}

async function runJSON(task, prompt, cacheKey = null) {
  const route = ROUTES[task] || { tier: 2, ttl: 3600, useFast: false };
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached !== null) return cached;
  }
  const result = await llm.generateJSON(prompt, route.useFast);
  if (cacheKey) cache.set(cacheKey, result, route.ttl);
  return result;
}

module.exports = {
  run, runJSON,
  stripHtml, dedup, compressTrends, compressPosts,
  ROUTES,
};
