'use strict';
/**
 * agents/selfImprovementAgent.js — ProfitEngine v4.0
 * Weekly AI optimization: analyzes post performance → mutates content strategy.
 * Self-modifying: updates niche targeting, content type weights, posting schedule.
 * Tier 2 analysis on compressed post data.
 */
const llm    = require('../utils/llm');
const logger = require('../utils/logger');
const state  = require('../utils/state');
const config = require('../config');
const { compressPrompt } = require('../utils/distillation');

async function learnFromResults() {
  const posts      = state.get('postsPublished', 0);
  const revenue    = state.get('revenue', {});
  const ctypePerf  = state.get('contentTypePerf', {});
  const platPerf   = state.get('socialPlatformPerf', {});
  const trends     = state.get('trendsProcessed', []).slice(-20);

  if (posts < 5) {
    logger.info('[SELF-IMPROVE] Not enough data yet (need 5+ posts)');
    return null;
  }

  const summary = compressPrompt(JSON.stringify({
    postsPublished: posts,
    revenueByPlatform: revenue,
    contentTypePerformance: ctypePerf,
    socialPlatformPerformance: platPerf,
    recentTrends: trends,
  }));

  const analysis = await llm.generateJSON(
    `You are the AI brain of ${config.businessName}, a content monetization engine.
Analyze this performance data and return a strategy update as JSON.

Data: ${summary}

Current niches: ${config.targetNiches.join(', ')}
Current products: ${config.affiliateProducts.join(', ')}

Return JSON with this exact shape:
{
  "topPerformingContentType": "...",
  "topPerformingPlatform": "...",
  "recommendedNicheAdjustment": "add X, reduce Y",
  "recommendedPostingTimeUTC": "HH:MM",
  "newContentTypeWeights": {"listicle": 1.5, "how-to": 1.2, "review": 1.0, "news-roundup": 0.8, "comparison": 1.1},
  "keyInsight": "one sentence max",
  "actionItems": ["item 1", "item 2", "item 3"]
}`,
    { tier: 2, maxTokens: 600 }
  );

  if (!analysis) {
    logger.warn('[SELF-IMPROVE] Analysis failed');
    return null;
  }

  // Apply content type weight updates
  if (analysis.newContentTypeWeights) {
    const perf = state.get('contentTypePerf', {});
    for (const [ct, weight] of Object.entries(analysis.newContentTypeWeights)) {
      if (!perf[ct]) perf[ct] = { count: 0, totalScore: 0 };
      perf[ct].avgScore = weight;
    }
    state.set('contentTypePerf', perf);
  }

  state.set('lastSelfImprovement', {
    ts: new Date().toISOString(),
    analysis,
  });

  logger.info('[SELF-IMPROVE] Strategy updated', { insight: analysis.keyInsight });
  return analysis;
}

async function discoverNewNiches() {
  const currentNiches = config.targetNiches;
  const revenue       = state.get('revenue', {});
  const topEarning    = Object.entries(revenue)
    .sort(([,a], [,b]) => (b.earned || 0) - (a.earned || 0))
    .slice(0, 3)
    .map(([k]) => k);

  const result = await llm.generateJSON(
    `Suggest 3 new profitable niches to add to a content monetization site.
Current niches: ${currentNiches.join(', ')}
Top earning platforms: ${topEarning.join(', ')}
Site domain: ${config.siteDomain}

Requirements:
- Low competition, growing traffic
- Monetizable with affiliate products or display ads
- Adjacent to current niches

Return JSON array: [{"niche": "...", "reason": "...", "affiliateProducts": ["...", "..."]}]`,
    { tier: 2, maxTokens: 500 }
  );

  if (result) {
    state.set('discoveredNiches', result);
    logger.info('[SELF-IMPROVE] New niches discovered', { count: result.length });
  }
  return result;
}

async function runWeeklyCycle() {
  logger.info('[SELF-IMPROVE] Weekly optimization cycle starting...');
  const [analysis, niches] = await Promise.allSettled([learnFromResults(), discoverNewNiches()]);
  logger.info('[SELF-IMPROVE] Weekly cycle complete');
  return {
    analysis: analysis.status === 'fulfilled' ? analysis.value : null,
    niches:   niches.status   === 'fulfilled' ? niches.value   : null,
  };
}

module.exports = { learnFromResults, discoverNewNiches, runWeeklyCycle };
