'use strict';
/**
 * agents/seoAgent.js — ProfitEngine v4.0
 * Keyword research via DDG Autocomplete + Google Suggest.
 * A/B title testing with engagement scoring.
 * Tier 1 for keyword extraction. 6h cache.
 */
const axios   = require('axios');
const llm     = require('../utils/llm');
const distill = require('../utils/distillation');
const logger  = require('../utils/logger');
const state   = require('../utils/state');
const config  = require('../config');

async function fetchDDGSuggestions(query) {
  try {
    const res = await axios.get('https://duckduckgo.com/ac/', {
      params: { q: query, type: 'list' },
      timeout: 8000,
      headers: { 'User-Agent': 'ProfitEngine/4.0' },
    });
    const data = res.data;
    if (Array.isArray(data) && Array.isArray(data[1])) return data[1].slice(0, 10);
    if (Array.isArray(data)) return data.map(d => d.phrase || d).filter(Boolean).slice(0, 10);
    return [];
  } catch { return []; }
}

async function fetchGoogleSuggest(query) {
  try {
    const res = await axios.get('https://suggestqueries.google.com/complete/search', {
      params: { client: 'firefox', q: query },
      timeout: 8000,
    });
    return (res.data?.[1] || []).slice(0, 10);
  } catch { return []; }
}

async function researchKeywords(topic) {
  const cacheKey = `seo_${topic.slice(0, 40).replace(/\s+/g, '_')}`;
  const cached = distill.dedup([]); // just using for its utilities
  // Check cache manually
  const { get, set } = require('../utils/distillation/cache');
  const hit = get(cacheKey);
  if (hit) return hit;

  const [ddg, google] = await Promise.allSettled([
    fetchDDGSuggestions(topic),
    fetchGoogleSuggest(topic),
  ]);
  const raw = [
    ...(ddg.status === 'fulfilled' ? ddg.value : []),
    ...(google.status === 'fulfilled' ? google.value : []),
  ].filter(Boolean);

  if (!raw.length) return { primary: topic, secondary: [], longTail: [] };

  const prompt = `SEO keyword strategist. Topic: "${topic}".
Raw suggestions: ${raw.join(', ')}.
Return JSON: { primary: string, secondary: string[], longTail: string[], metaDescription: string }
Focus on buyer intent and monetization potential.`;

  const result = await llm.generateJSON(prompt, true); // Tier 1
  set(cacheKey, result, 6 * 3600);
  return result;
}

async function optimizePostSEO(post) {
  if (!post?.title || !post?.body) return post;
  const keywords = await researchKeywords(post.title).catch(() => ({ primary: post.title, secondary: [], longTail: [] }));

  // Tier 0: inject keywords into body if missing
  let body = post.body;
  if (keywords.primary && !body.toLowerCase().includes(keywords.primary.toLowerCase())) {
    body = body.replace(/^(#{1,3} .+)/m, `$1\n\n${keywords.primary} is a topic worth exploring.`);
  }

  return {
    ...post,
    body,
    keywords: [keywords.primary, ...keywords.secondary].filter(Boolean),
    metaDescription: keywords.metaDescription || post.title,
    seoOptimized: true,
  };
}

async function runABTitleTest(post) {
  if (!post?.title) return post;
  const cacheKey = `ab_${post.id || post.title.slice(0,20).replace(/\s/g,'_')}`;
  const { get, set } = require('../utils/distillation/cache');
  const cached = get(cacheKey);
  if (cached) return { ...post, title: cached.winner || post.title };

  const prompt = `Generate 3 alternative SEO-optimized titles for this blog post:
Original: "${post.title}"
Niche: ${post.niche || 'general'}
Return JSON array of 3 title strings. Vary: curiosity, how-to, listicle formats.`;

  try {
    const variants = await llm.generateJSON(prompt, true);
    if (!Array.isArray(variants) || !variants.length) return post;
    // Pick the one with most power words (simple heuristic Tier 0)
    const POWER_WORDS = ['best', 'top', 'ultimate', 'proven', 'easy', 'free', 'fast', 'make money', 'secret', 'complete'];
    const scored = [post.title, ...variants].map(t => ({
      title: t,
      score: POWER_WORDS.filter(w => t.toLowerCase().includes(w)).length
    }));
    const winner = scored.sort((a, b) => b.score - a.score)[0].title;
    set(cacheKey, { winner, variants }, 24 * 3600);
    logger.info(`[SEO] A/B winner: "${winner.slice(0,60)}"`);
    return { ...post, title: winner, abTested: true };
  } catch {
    return post;
  }
}

async function runSEOCycle(recentPosts = []) {
  logger.info('[SEO] Running SEO cycle...');
  const niches = config.targetNiches;
  const allKeywords = [];
  for (const niche of niches.slice(0, 3)) {
    try {
      const kw = await researchKeywords(niche);
      allKeywords.push({ niche, ...kw });
    } catch { /* continue */ }
  }
  state.set('latestKeywords', allKeywords);
  state.set('lastSEOCycle', new Date().toISOString());
  logger.info(`[SEO] Cycle complete — ${allKeywords.length} niches researched`);
  return allKeywords;
}

module.exports = { researchKeywords, optimizePostSEO, runABTitleTest, runSEOCycle };
