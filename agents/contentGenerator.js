'use strict';
/**
 * agents/contentGenerator.js — ProfitEngine v4.0
 * Blog posts, listicles, how-tos, affiliate reviews, merch prompts.
 * Self-modifying prompt templates scored by engagement metrics.
 * Tier 1 for social/merch, Tier 2 for full blog posts.
 */
const llm     = require('../utils/llm');
const logger  = require('../utils/logger');
const state   = require('../utils/state');
const config  = require('../config');
const contentIdentity = require('../utils/contentIdentity');

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

function duplicateRecords() {
  return contentIdentity.flattenRecords(
    state.get('generatedContentRecords', []),
    state.get('publishedContentRecords', []),
    state.get('publishedPosts', []),
    state.get('publishLog', []),
    state.get('skippedContentPosts', [])
  );
}

function shouldGenerateTrend(trend) {
  if (!trend?.title) return { ok: false, reason: 'missing_title' };
  const duplicate = contentIdentity.findDuplicate(trend, duplicateRecords());
  if (duplicate) {
    return { ok: false, reason: 'duplicate_topic', duplicate };
  }
  return { ok: true };
}

async function generatePost(trend) {
  const check = shouldGenerateTrend(trend);
  if (!check.ok) {
    const skipped = contentIdentity.buildRecord(trend, {
      reason: check.reason,
      duplicateOf: check.duplicate?.title || check.duplicate?.slug || 'unknown',
      stage: 'generation',
    });
    state.push('skippedContentPosts', skipped);
    logger.warn(`[ContentGen] Skipping duplicate trend: "${trend?.title || 'untitled'}"`);
    return null;
  }

  const contentType = pickContentType(trend);
  const prompt = buildPrompt(trend, contentType);

  logger.info(`[ContentGen] Generating ${contentType}: "${trend.title.slice(0,50)}"`);
  const content = await llm.generate(prompt, null, 1800);

  const post = {
    id: `post_${Date.now()}`,
    title: trend.title,
    canonicalTopic: trend.title,
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

  // Track for A/B testing and duplicate suppression.
  const queue = state.get('unpublishedPosts', []);
  queue.push(post);
  state.set('unpublishedPosts', queue.slice(-50));
  state.push('generatedContentRecords', contentIdentity.buildRecord(post, { stage: 'generation' }), 1000);
  state.increment('totalPostsGenerated');
  return post;
}

async function generateBatch(trends) {
  const results = [];
  for (const trend of trends.slice(0, config.contentPerRun)) {
    try {
      const post = await generatePost(trend);
      if (post) results.push(post);
    } catch (err) {
      logger.error(`[ContentGen] Failed for "${trend.title}"`, { error: err.message });
    }
  }
  logger.info(`[ContentGen] Generated ${results.length}/${trends.length} posts`);
  return results;
}

async function generateAffiliateReview(product) {
  const title = `${product} Review: Is It Worth It?`;
  const check = shouldGenerateTrend({ title });
  if (!check.ok) {
    logger.warn(`[ContentGen] Skipping duplicate affiliate review: "${title}"`);
    return null;
  }

  const prompt = `Write a 600-word honest affiliate review of "${product}" for alreadyherellc.com.
Niche: ${config.targetNiches[0]}. Include pros, cons, who it's for, and a CTA.
Include [AMAZON_LINK] where the buy link should go. Format: Markdown.`;
  const content = await llm.generate(prompt, null, 1000);
  const post = {
    id: `review_${Date.now()}`,
    title,
    canonicalTopic: title,
    contentType: 'affiliate review',
    body: content,
    generatedAt: new Date().toISOString(),
    published: false,
  };
  state.push('generatedContentRecords', contentIdentity.buildRecord(post, { stage: 'generation' }), 1000);
  return post;
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

module.exports = { generatePost, generateBatch, generateAffiliateReview, generateMerchPrompt, recordEngagement, shouldGenerateTrend };
