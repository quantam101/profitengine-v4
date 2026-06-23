'use strict';
/**
 * publishers/index.js - ProfitEngine v4.0
 * Multi-arm bandit platform router. Daily cap enforcement.
 * Tracks per-platform success rates for adaptive weighting.
 */
const logger   = require('../utils/logger');
const state    = require('../utils/state');
const config   = require('../config');
const contentIdentity = require('../utils/contentIdentity');

const devto    = require('./devto');
const hashnode = require('./hashnode');
const medium   = require('./medium');
const reddit   = require('./reddit');
const mastodon = require('./mastodon');
const pinterest = require('./pinterest');

// Platform configs: { module, configKey, weight }
const PLATFORMS = [
  { name: 'devto',     mod: devto,     key: 'devtoApiKey',        type: 'blog' },
  { name: 'hashnode',  mod: hashnode,  key: 'hashnodeApiKey',     type: 'blog' },
  { name: 'medium',    mod: medium,    key: 'mediumApiKey',       type: 'blog' },
  { name: 'reddit',    mod: reddit,    key: 'redditClientId',     type: 'social' },
  { name: 'mastodon',  mod: mastodon,  key: 'mastodonAccessToken',type: 'social' },
  { name: 'pinterest', mod: pinterest, key: 'pinterestToken',     type: 'social' },
];

function getDailyKey() {
  return `posts_today_${new Date().toISOString().slice(0,10)}`;
}

function getSuccessRate(platform) {
  const stats = state.get(`platform_stats_${platform}`, { success: 0, fail: 0 });
  const total = stats.success + stats.fail;
  return total === 0 ? 0.5 : stats.success / total;
}

function recordResult(platform, success) {
  const key = `platform_stats_${platform}`;
  const stats = state.get(key, { success: 0, fail: 0 });
  if (success) stats.success++;
  else stats.fail++;
  state.set(key, stats);
}

function platformRecords() {
  return contentIdentity.flattenRecords(
    state.get('platformPublishedContentRecords', []),
    state.get('publishLog', [])
  );
}

async function publish(post) {
  if (!post?.title || !post?.body) return { published: 0, platforms: [] };

  const duplicate = contentIdentity.findDuplicate(post, platformRecords());
  if (duplicate) {
    const skipped = contentIdentity.buildRecord(post, {
      reason: 'duplicate_platform_publish',
      duplicateOf: duplicate.title || duplicate.slug || 'unknown',
      stage: 'platform',
    });
    state.push('skippedPlatformPosts', skipped);
    logger.warn(`[PUBLISHER] Duplicate platform post skipped: "${post.title.slice(0,50)}"`);
    return { published: 0, skipped: true, reason: 'duplicate_platform_publish', platforms: [] };
  }

  const today = state.get(getDailyKey(), 0);
  if (today >= config.maxPostsPerDay) {
    logger.warn(`[PUBLISHER] Daily cap reached: ${today}/${config.maxPostsPerDay}`);
    return { published: 0, capped: true, platforms: [] };
  }

  // Filter enabled platforms
  const enabled = PLATFORMS.filter(p => config[p.key]);

  // Multi-arm bandit: sort by UCB1 score (success rate + exploration bonus)
  const totalPublishes = state.get('totalPostsPublished', 1);
  const ranked = enabled.map(p => {
    const rate = getSuccessRate(p.name);
    const n    = state.get(`platform_stats_${p.name}`, { success: 0, fail: 0 });
    const total = n.success + n.fail || 1;
    const ucb  = rate + Math.sqrt(2 * Math.log(totalPublishes) / total);
    return { ...p, ucb };
  }).sort((a, b) => b.ucb - a.ucb);

  // Publish blog platforms first (all enabled), then top social
  const blogPlatforms   = ranked.filter(p => p.type === 'blog');
  const socialPlatforms = ranked.filter(p => p.type === 'social').slice(0, 2);
  const targets = [...blogPlatforms, ...socialPlatforms];

  const results = await Promise.allSettled(targets.map(p => p.mod.publish(post)));

  const succeeded = [];
  results.forEach((r, i) => {
    const ok = r.status === 'fulfilled' && r.value;
    recordResult(targets[i].name, !!ok);
    if (ok) succeeded.push({ platform: targets[i].name, url: r.value });
  });

  if (succeeded.length > 0) {
    state.increment(getDailyKey());
    state.increment('totalPostsPublished');
    const record = contentIdentity.buildRecord(post, {
      platforms: succeeded.map(s => s.platform),
      urls: succeeded.map(s => s.url),
      stage: 'platform',
    });
    state.push('platformPublishedContentRecords', record, 1000);
    state.push('publishLog', {
      title: post.title, sourceTitle: post.trend?.title || post.sourceTitle || post.title,
      platforms: succeeded.map(s => s.platform),
      urls: succeeded.map(s => s.url), ts: new Date().toISOString()
    });
    logger.info(`[PUBLISHER] "${post.title.slice(0,50)}" -> ${succeeded.map(s=>s.platform).join(', ')}`);
  }

  return { published: succeeded.length, platforms: succeeded };
}

function platformStats() {
  return PLATFORMS.map(p => ({
    name: p.name,
    enabled: !!config[p.key],
    successRate: Math.round(getSuccessRate(p.name) * 100) + '%',
    ...state.get(`platform_stats_${p.name}`, { success: 0, fail: 0 }),
  }));
}

module.exports = { publish, platformStats };
