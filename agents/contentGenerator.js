'use strict';
/**
 * agents/contentGenerator.js — ProfitEngine v4.0
 * Blog posts, listicles, how-tos, affiliate reviews, merch prompts.
 * Self-modifying prompt templates scored by engagement metrics.
 * Tier 1 for social/merch, Tier 2 for full blog posts.
 */
const llm     = require('../utils/llm');
const distill = require('../utils/distillation');
const logger  = require('../utils/logger');
const state   = require('../utils/state');
const config  = require('../config');

const CONTENT_TYPES = ['how-to guide', 'listicle', 'product review', 'comparison post', 'case study'];

function pickContentType(trend) {
  // Pick based on historical performance of each type
  const perf = state.get('contentTypePerformance', {});
  const best = CONTENT_TYPES.reduce((a, b) => (perf[a]||0) >= (perf[b]||0) ? a : b);
  return trend.contentType || best;
}

function buildPrompt(trend, contentType) {
  const affiliate = (trend.affiliateProducts || config.affiliateProducts.slice(0,3)).join(', ');
  return `Write a compelling ${contentType} blog post optimized for SEO and affiliate revenue.

Topic: "${trend.title}"
Niche: ${trend.niche || config.targetNiches[0]}
Suggested angle: ${trend.suggestedAngle || 'practical guide for beginners'}
Target keywords: ${(trend.keywords || []).join(', ')}
Affiliate products to naturally mention: ${affiliate}

Requirements:
- 800-1200 words
- SEO-optimized H2/H3 headers
- Natural affiliate product mentions (not spammy)
- Include [AMAZON_LINK] placeholder where product links should go
- Engaging intro that hooks the reader
- Clear actionable takeaways
- Call-to-action at end

Format: Markdown. Include frontmatter:
---
title: [title]
description: [150-char SEO meta description]
tags: [comma-separated tags]
date: ${new Date().toISOString().slice(0,10)}
---`;
}

async function generatePost(trend) {
  const contentType = pickContentType(trend);
  const cacheKey = `post_${trend.title.slice(0,40).replace(/\s+/g,'_')}`;
  const cached = distill.dedup([]);  // just using distill for dedup util
  const prompt = buildPrompt(trend, contentType);

  logger.info(`[ContentGen] Generating ${contentType}: "${trend.title.slice(0,50)}"`);
  const content = await llm.generate(prompt, null, 1800);

  const post = {
    id: `post_${Date.now()}`,
    title: trend.title,
    contentType,
    niche: trend.niche,
    keywords: trend.keywords || [],
    body: content,
    trend,
    generatedAt: new Date().toISOString(),
    published: false,
    views: 0,
    clicks: 0,
  };

  // Track for A/B testing
  const queue = state.get('unpublishedPosts', []);
  queue.push(post);
  state.set('unpublishedPosts', queue.slice(-50));
  state.increment('totalPostsGenerated');
  return post;
}

async function generateBatch(trends) {
  const results = [];
  for (const trend of trends.slice(0, config.contentPerRun)) {
    try {
      const post = await generatePost(trend);
      results.push(post);
    } catch (err) {
      logger.error(`[ContentGen] Failed for "${trend.title}"`, { error: err.message });
    }
  }
  logger.info(`[ContentGen] Generated ${results.length}/${trends.length} posts`);
  return results;
}

async function generateAffiliateReview(product) {
  const prompt = `Write a 600-word honest affiliate review of "${product}" for alreadyherellc.com.
Niche: ${config.targetNiches[0]}. Include pros, cons, who it's for, and a CTA.
Include [AMAZON_LINK] where the buy link should go. Format: Markdown.`;
  const content = await llm.generate(prompt, null, 1000);
  return {
    id: `review_${Date.now()}`,
    title: `${product} Review: Is It Worth It?`,
    contentType: 'affiliate review',
    body: content,
    generatedAt: new Date().toISOString(),
    published: false,
  };
}

async function generateMerchPrompt(niche) {
  const prompt = `Generate 3 print-on-demand product design briefs for the "${niche}" niche.
Each brief: product type, design concept, target audience, color palette, tagline.
Return as JSON array: [{productType,designConcept,targetAudience,colorPalette,tagline}]`;
  return llm.generateJSON(prompt, true); // Tier 1
}

// Record engagement for prompt self-improvement
function recordEngagement(postId, contentType, views, clicks) {
  const perf = state.get('contentTypePerformance', {});
  const score = views * 0.1 + clicks * 1.0;
  perf[contentType] = ((perf[contentType] || 0) + score) / 2; // rolling avg
  state.set('contentTypePerformance', perf);
}

module.exports = { generatePost, generateBatch, generateAffiliateReview, generateMerchPrompt, recordEngagement };
