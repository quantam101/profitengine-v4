'use strict';
/**
 * agents/podAgent.js — ProfitEngine v4.0
 * Print-on-Demand: niche discovery + Printify design brief generator.
 * Tier 1 prompts. 24h cache.
 */
const axios  = require('axios');
const llm    = require('../utils/llm');
const logger = require('../utils/logger');
const state  = require('../utils/state');
const config = require('../config');
const cache  = require('../utils/distillation/cache');
const revenue = require('./revenueAgent');

const CACHE_TTL = 24 * 60 * 60 * 1000;

async function findProfitableNiches() {
  const cacheKey = 'pod_niches';
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const result = await llm.generateJSON(
    `Identify 5 profitable print-on-demand niches for ${config.businessName}.
Adjacent to: ${config.targetNiches.join(', ')}.
Focus on: low competition, passionate buyers, repeat purchase potential.

Return JSON array:
[{
  "niche": "...",
  "targetAudience": "...",
  "bestProducts": ["t-shirt", "mug", "tote"],
  "pricePoint": "$XX",
  "competitionLevel": "low|medium|high",
  "sampleDesignConcept": "..."
}]`,
    { tier: 1, maxTokens: 600 }
  );

  if (result) {
    cache.set(cacheKey, result, CACHE_TTL);
    state.set('podNiches', result);
    logger.info('[POD] Niches discovered', { count: result.length });
  }
  return result;
}

async function generateMerchDesignPrompt(niche) {
  const cacheKey = `pod_design_${(niche || 'default').replace(/\s/g, '_')}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const targetNiche = niche || config.targetNiches[0];
  const result = await llm.generateJSON(
    `Create a Printify/Midjourney design brief for a t-shirt targeting the "${targetNiche}" niche.

Return JSON:
{
  "title": "Product title for Printify listing",
  "midjourney_prompt": "Detailed image generation prompt for the design",
  "style": "minimalist|bold|vintage|funny|inspirational",
  "colors": ["#HEX1", "#HEX2"],
  "targetKeywords": ["kw1", "kw2", "kw3"],
  "printifyDescription": "Listing description for Printify store",
  "estimatedPrice": "$XX.XX"
}`,
    { tier: 1, maxTokens: 400 }
  );

  if (result) {
    cache.set(cacheKey, result, CACHE_TTL);
    logger.info(`[POD] Design brief generated for: ${targetNiche}`);
  }
  return result;
}

async function createPrintifyProduct(designBrief) {
  if (!config.printifyApiKey || !config.printifyShopId) {
    logger.warn('[POD] Printify config missing — skipping product creation');
    return null;
  }

  try {
    const res = await axios.post(
      `https://api.printify.com/v1/shops/${config.printifyShopId}/products.json`,
      {
        title:       designBrief.title,
        description: designBrief.printifyDescription,
        tags:        designBrief.targetKeywords || [],
        variants:    [{ price: Math.round(parseFloat(designBrief.estimatedPrice?.replace('$', '') || '25') * 100) }],
      },
      {
        headers: { Authorization: `Bearer ${config.printifyApiKey}`, 'Content-Type': 'application/json' },
        timeout: 15_000,
      }
    );
    logger.info(`[POD] Printify product created: ${designBrief.title}`);
    state.increment('podProductsCreated');
    return res.data;
  } catch (err) {
    logger.warn('[POD] Printify create failed', { error: err.message });
    return null;
  }
}

module.exports = { findProfitableNiches, generateMerchDesignPrompt, createPrintifyProduct };
