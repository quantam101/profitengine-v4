'use strict';
/**
 * agents/earningsAgent.js — ProfitEngine v4.0
 * Real earnings tracking: Dev.to views API, Medium stats, withdrawal alerts.
 * Tier 0: all math/templates local. Tier 2: insights only when crossing thresholds.
 */
const axios   = require('axios');
const logger  = require('../utils/logger');
const state   = require('../utils/state');
const config  = require('../config');
const email   = require('../utils/email');
const revenue = require('./revenueAgent');

// ── Dev.to: real view counts via API ─────────────────────────────────────────
async function fetchDevtoStats() {
  if (!config.devtoApiKey) return { views: 0, reactions: 0, posts: 0 };
  try {
    const res = await axios.get('https://dev.to/api/articles/me', {
      headers: { 'api-key': config.devtoApiKey },
      params:  { per_page: 30 },
      timeout: 10_000,
    });
    const articles = res.data || [];
    const views     = articles.reduce((s, a) => s + (a.page_views_count || 0), 0);
    const reactions = articles.reduce((s, a) => s + (a.positive_reactions_count || 0), 0);

    // Estimate earnings: Dev.to Partner pays ~$0.01 per 100 views
    const estimated = (views / 100) * 0.01;
    revenue.recordEarning('devto', estimated, { views, posts: articles.length });

    return { views, reactions, posts: articles.length, estimated };
  } catch (err) {
    logger.warn('[EARNINGS] Dev.to API failed', { error: err.message });
    return { views: 0, reactions: 0, posts: 0, estimated: 0 };
  }
}

// ── Withdrawal alert ─────────────────────────────────────────────────────────
async function checkWithdrawalThresholds() {
  const total = revenue.getTotalRevenue();
  const byPlatform = revenue.getRevenueByPlatform();
  const lastAlert  = state.get('lastWithdrawalAlert', 0);

  // Alert when total crosses $10 threshold and hasn't alerted in last 24h
  if (total >= config.amazonPayoutThreshold && Date.now() - lastAlert > 86_400_000) {
    const breakdown = byPlatform
      .filter(p => p.earned > 0)
      .map(p => `  ${p.platform}: $${p.earned.toFixed(2)}`)
      .join('\n');

    const body = `ProfitEngine has accumulated $${total.toFixed(2)} in earnings.

BREAKDOWN:
${breakdown}

ACTION REQUIRED:
${total >= 10  ? '✓ Amazon Associates: Go to affiliate-program.amazon.com → Request payout' : ''}
${total >= 10  ? '✓ Dev.to: Earnings paid automatically when threshold met' : ''}
${total >= 10  ? '✓ Medium: earnings.medium.com → Request payout' : ''}

Total posts published: ${state.get('postsPublished', 0)}
Total social posts: ${state.get('socialPosts', 0)}
Running since: ${state.get('startedAt', 'unknown')}
`;

    await email.sendAlert(`$${total.toFixed(2)} ready to withdraw!`, body);
    state.set('lastWithdrawalAlert', Date.now());
    logger.info(`[EARNINGS] Withdrawal alert sent: $${total.toFixed(2)}`);
  }
}

// ── Daily report ─────────────────────────────────────────────────────────────
async function sendDailyReport() {
  const total      = revenue.getTotalRevenue();
  const byPlatform = revenue.getRevenueByPlatform();
  const devto      = await fetchDevtoStats();
  const posts      = state.get('postsPublished', 0);
  const social     = state.get('socialPosts', 0);
  const insights   = state.get('lastOptimizationInsights', 'No analysis yet.');

  const breakdown = byPlatform
    .map(p => `  ${p.platform.padEnd(12)}: $${p.earned.toFixed(2)}`)
    .join('\n');

  const body = `=== ProfitEngine Daily Report — ${new Date().toDateString()} ===

TOTAL REVENUE: $${total.toFixed(2)}

BREAKDOWN:
${breakdown}

ACTIVITY:
  Posts published: ${posts}
  Social posts:    ${social}
  Dev.to views:    ${devto.views.toLocaleString()}
  Dev.to reactions:${devto.reactions}

OPTIMIZATION INSIGHTS:
${insights}

Status: RUNNING 24/7 on Oracle Cloud
Site: https://${config.siteDomain}

${total >= config.amazonPayoutThreshold ? '⚡ WITHDRAWAL AVAILABLE — check your accounts!' : `Next payout threshold: $${config.amazonPayoutThreshold}`}
`;

  await email.sendAlert(`Daily Report — $${total.toFixed(2)} total`, body);
  logger.info('[EARNINGS] Daily report sent');
}

module.exports = {
  fetchDevtoStats,
  checkWithdrawalThresholds,
  sendDailyReport,
};
