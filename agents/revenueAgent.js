'use strict';
/**
 * agents/revenueAgent.js — ProfitEngine v4.0
 * Real revenue tracking across all streams.
 * autoScale() persists scanIntervalMinutes to state.
 * Platform payout optimizer using earned-per-post ratio.
 * Tier 2 insights only — all math is local.
 */
const llm    = require('../utils/llm');
const logger = require('../utils/logger');
const state  = require('../utils/state');
const config = require('../config');
const cache  = require('../utils/distillation/cache');

const PLATFORMS = ['devto', 'hashnode', 'medium', 'amazon', 'pinterest', 'printify'];
const INSIGHT_TTL = 6 * 60 * 60 * 1000;

// ── Revenue record helpers ───────────────────────────────────────────────────
function getRevenue() {
  return state.get('revenue', {
    devto:     { earned: 0, posts: 0, views: 0 },
    hashnode:  { earned: 0, posts: 0, views: 0 },
    medium:    { earned: 0, posts: 0, views: 0 },
    amazon:    { earned: 0, clicks: 0, orders: 0 },
    pinterest: { earned: 0, impressions: 0 },
    printify:  { earned: 0, orders: 0 },
  });
}

function recordEarning(platform, amount, meta = {}) {
  const rev = getRevenue();
  if (!rev[platform]) rev[platform] = { earned: 0 };
  rev[platform].earned = (rev[platform].earned || 0) + amount;
  Object.assign(rev[platform], meta);
  state.set('revenue', rev);
  logger.info(`[REVENUE] +$${amount.toFixed(2)} from ${platform}`);
}

function getTotalRevenue() {
  const rev = getRevenue();
  return Object.values(rev).reduce((sum, p) => sum + (p.earned || 0), 0);
}

function getRevenueByPlatform() {
  const rev = getRevenue();
  return PLATFORMS.map(p => ({ platform: p, earned: rev[p]?.earned || 0 }))
    .sort((a, b) => b.earned - a.earned);
}

// ── autoScale: adjust scan interval based on revenue velocity ────────────────
function autoScale() {
  const total = getTotalRevenue();
  const posts = state.get('postsPublished', 0);

  let intervalMinutes;
  if (total > 100 || posts > 200)       intervalMinutes = 10;  // Scale up
  else if (total > 50 || posts > 100)   intervalMinutes = 12;
  else if (total > 10 || posts > 50)    intervalMinutes = 15;
  else                                   intervalMinutes = 20;  // Ramp-up phase

  state.set('scanIntervalMinutes', intervalMinutes);
  logger.info(`[REVENUE] autoScale: interval → ${intervalMinutes}min (revenue=$${total.toFixed(2)}, posts=${posts})`);
  return intervalMinutes;
}

// ── AI optimization insights (Tier 2, cached 6h) ─────────────────────────────
async function analyzeAndOptimize() {
  const cacheKey = 'revenue_optimize';
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const rev     = getRevenue();
  const posts   = state.get('postsPublished', 0);
  const social  = state.get('socialPosts', 0);
  const ctypePerf = state.get('contentTypePerf', {});

  const summary = JSON.stringify({ revenue: rev, posts, social, contentTypePerf: ctypePerf });

  const insights = await llm.generate(
    `You are a revenue optimization advisor for ${config.businessName}.
Current metrics: ${summary}

Provide 3 specific, actionable recommendations to increase revenue. 
Each recommendation: 1-2 sentences. Focus on highest-leverage changes.
Format: numbered list.`,
    { tier: 2, maxTokens: 400 }
  );

  const result = insights || 'Insufficient data for optimization insights.';
  cache.set(cacheKey, result, INSIGHT_TTL);
  state.set('lastOptimizationInsights', result);
  logger.info('[REVENUE] Optimization analysis complete');
  return result;
}

// ── Platform allocation optimizer ────────────────────────────────────────────
function getOptimalPlatformAllocation() {
  const rev      = getRevenue();
  const rankings = PLATFORMS
    .map(p => {
      const earned = rev[p]?.earned || 0;
      const posts  = rev[p]?.posts  || 1;
      return { platform: p, roi: earned / posts };
    })
    .sort((a, b) => b.roi - a.roi);

  return rankings;
}

module.exports = {
  getRevenue,
  recordEarning,
  getTotalRevenue,
  getRevenueByPlatform,
  analyzeAndOptimize,
  autoScale,
  getOptimalPlatformAllocation,
};
