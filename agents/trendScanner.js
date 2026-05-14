'use strict';
/**
 * agents/trendScanner.js — ProfitEngine v4.0
 * Google Trends RSS + Reddit hot posts → AI monetization scorer.
 * Distillation: Tier 0 fetch+compress, Tier 2 scoring.
 * Signals pushed to UltraFlow VHLL on every scored trend.
 */
const axios   = require('axios');
const xml2js  = require('xml2js');
const llm     = require('../utils/llm');
const distill = require('../utils/distillation');
const logger  = require('../utils/logger');
const state   = require('../utils/state');
const config  = require('../config');

const SLEEP = ms => new Promise(r => setTimeout(r, ms));

async function fetchGoogleTrends() {
  try {
    const res = await axios.get('https://trends.google.com/trends/trendingsearches/daily/rss?geo=US', {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProfitEngine/4.0)' },
    });
    const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false });
    const items = parsed?.rss?.channel?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    return arr.slice(0, 15).map(item => ({
      title: item.title || '',
      source: 'google_trends',
      traffic: parseInt((item['ht:approx_traffic'] || '0').replace(/[^0-9]/g, '')) || 0,
    })).filter(t => t.title);
  } catch (err) {
    logger.warn('[TrendScanner] Google Trends failed', { error: err.message });
    return [];
  }
}

async function fetchRedditTrends() {
  const subredditMap = {
    'passive income': 'passive_income',
    'ai tools': 'artificial',
    'side hustle': 'sidehustle',
    'print on demand': 'printondemand',
    'affiliate marketing': 'affiliatemarketing',
    'blogging': 'blogging',
  };
  const results = [];
  for (const niche of config.targetNiches.slice(0, 3)) {
    const sub = subredditMap[niche] || niche.replace(/\s+/g, '_');
    try {
      const res = await axios.get(`https://www.reddit.com/r/${sub}/hot.json?limit=5`, {
        headers: { 'User-Agent': 'ProfitEngine/4.0' },
        timeout: 10000,
      });
      const posts = res.data?.data?.children || [];
      posts.forEach(p => {
        if (p.data.score > 50) results.push({
          title: p.data.title,
          source: 'reddit',
          niche,
          score: p.data.score,
        });
      });
      await SLEEP(600);
    } catch { /* continue */ }
  }
  return results;
}

async function scoreTrends(rawTrends) {
  if (!rawTrends.length) return [];
  // Tier 0: compress
  const compressed = distill.compressTrends(rawTrends.slice(0, 20));
  // Deduplicate against already-processed titles
  const processed = new Set(state.get('trendsProcessed', []));
  const filtered  = rawTrends.filter(t => !processed.has(t.title.toLowerCase()));
  if (!filtered.length) return [];

  const prompt = `Monetization strategist. Active niches: ${config.targetNiches.join(', ')}.
Affiliate products: ${config.affiliateProducts.join(', ')}.
Trending topics (compressed):
${distill.compressTrends(filtered.slice(0, 20))}

Return TOP 5 monetizable as JSON array:
[{rank,title,niche,monetizationScore,suggestedAngle,affiliateProducts,keywords,contentType}]
Only include monetizationScore >= 60.`;

  try {
    const scored = await llm.generateJSON(prompt);
    return Array.isArray(scored) ? scored : [];
  } catch (err) {
    logger.warn('[TrendScanner] Scoring failed', { error: err.message });
    return [];
  }
}

async function scanTrends() {
  logger.info('[TrendScanner] Starting scan...');
  const [g, r] = await Promise.allSettled([fetchGoogleTrends(), fetchRedditTrends()]);
  const raw = [
    ...(g.status === 'fulfilled' ? g.value : []),
    ...(r.status === 'fulfilled' ? r.value : []),
  ];
  logger.info(`[TrendScanner] ${raw.length} raw trends collected`);
  if (!raw.length) return [];

  const scored = await scoreTrends(distill.dedup(raw));
  logger.info(`[TrendScanner] ${scored.length} monetizable trends identified`);

  // Update processed set (Tier 0)
  const prev = state.get('trendsProcessed', []);
  state.set('trendsProcessed', [...prev, ...scored.map(t => t.title.toLowerCase())].slice(-300));
  state.set('lastTrendScan', new Date().toISOString());
  state.set('latestTrends', scored);
  state.increment('totalTrendsScanned', raw.length);

  return scored;
}

module.exports = { scanTrends, fetchGoogleTrends, fetchRedditTrends };
