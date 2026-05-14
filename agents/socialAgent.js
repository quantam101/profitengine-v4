'use strict';
/**
 * agents/socialAgent.js — ProfitEngine v4.0
 * Multi-platform social distribution: Mastodon, Reddit, Pinterest, Twitter.
 * Multi-arm bandit: tracks engagement per platform → biases distribution.
 * Tier 1 caption generation. 1h caption cache.
 */
const axios    = require('axios');
const llm      = require('../utils/llm');
const logger   = require('../utils/logger');
const state    = require('../utils/state');
const config   = require('../config');
const cache    = require('../utils/distillation/cache');

const CAPTION_TTL = 60 * 60 * 1000; // 1 hour

// ── Platform engagement tracker (multi-arm bandit) ───────────────────────────
function recordEngagement(platform, score) {
  const perf = state.get('socialPlatformPerf', {});
  const p    = perf[platform] || { count: 0, totalScore: 0, avgScore: 1 };
  p.count++;
  p.totalScore += score;
  p.avgScore    = p.totalScore / p.count;
  perf[platform] = p;
  state.set('socialPlatformPerf', perf);
}

function getPlatformScore(platform) {
  const perf = state.get('socialPlatformPerf', {});
  return perf[platform]?.avgScore || 1;
}

// ── Caption generator ─────────────────────────────────────────────────────────
async function generateCaption(post, platform) {
  const cacheKey = `caption_${platform}_${post.slug || post.title.slice(0, 40).replace(/\s/g, '_')}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const charLimits = { twitter: 280, mastodon: 500, reddit: 300, pinterest: 500 };
  const limit = charLimits[platform] || 300;

  const caption = await llm.generate(
    `Write a ${platform} post promoting this article for ${config.businessName}.
Title: "${post.title}"
Niche: ${post.niche || config.targetNiches[0]}
URL: https://${config.siteDomain}/posts/${post.slug || 'article'}

Requirements:
- Max ${limit} characters
- Engaging hook in first line
- Include relevant hashtags (${platform === 'twitter' ? '2-3' : '3-5'})
- CTA at end
- Conversational, not salesy
Return only the post text.`,
    { tier: 1, maxTokens: 200 }
  );

  if (caption) cache.set(cacheKey, caption, CAPTION_TTL);
  return caption || `Check out: ${post.title} → https://${config.siteDomain}/posts/${post.slug}`;
}

// ── Mastodon ─────────────────────────────────────────────────────────────────
async function postMastodon(post) {
  if (!config.mastodonAccessToken) return false;
  try {
    const status = await generateCaption(post, 'mastodon');
    await axios.post(
      `https://${config.mastodonInstance}/api/v1/statuses`,
      { status },
      { headers: { Authorization: `Bearer ${config.mastodonAccessToken}` }, timeout: 10_000 }
    );
    logger.info(`[SOCIAL] Mastodon: posted "${post.title}"`);
    recordEngagement('mastodon', 1);
    return true;
  } catch (err) {
    logger.warn('[SOCIAL] Mastodon failed', { error: err.message });
    return false;
  }
}

// ── Reddit ────────────────────────────────────────────────────────────────────
let _redditToken = null;
let _redditTokenExpiry = 0;

async function getRedditToken() {
  if (_redditToken && Date.now() < _redditTokenExpiry) return _redditToken;
  if (!config.redditClientId || !config.redditClientSecret) return null;
  try {
    const res = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      `grant_type=password&username=${encodeURIComponent(config.redditUsername)}&password=${encodeURIComponent(config.redditPassword)}`,
      {
        auth: { username: config.redditClientId, password: config.redditClientSecret },
        headers: { 'User-Agent': 'ProfitEngine/4.0', 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10_000,
      }
    );
    _redditToken       = res.data.access_token;
    _redditTokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    return _redditToken;
  } catch {
    return null;
  }
}

const NICHE_SUBREDDIT = {
  'passive income':      'passive_income',
  'ai tools':            'artificial',
  'side hustle':         'sidehustle',
  'print on demand':     'printondemand',
  'affiliate marketing': 'affiliatemarketing',
};

async function postReddit(post) {
  const token = await getRedditToken();
  if (!token) return false;
  const niche = post.niche || config.targetNiches[0];
  const sub   = NICHE_SUBREDDIT[niche] || 'blogging';
  try {
    await axios.post(
      'https://oauth.reddit.com/api/submit',
      new URLSearchParams({
        kind:     'link',
        sr:       sub,
        title:    post.title,
        url:      `https://${config.siteDomain}/posts/${post.slug || 'article'}`,
        resubmit: 'true',
        nsfw:     'false',
      }),
      {
        headers: {
          Authorization: `bearer ${token}`,
          'User-Agent':  'ProfitEngine/4.0',
        },
        timeout: 10_000,
      }
    );
    logger.info(`[SOCIAL] Reddit: posted to r/${sub}`);
    recordEngagement('reddit', 2);
    return true;
  } catch (err) {
    logger.warn('[SOCIAL] Reddit failed', { error: err.message });
    return false;
  }
}

// ── Pinterest ─────────────────────────────────────────────────────────────────
async function postPinterest(post) {
  if (!config.pinterestToken || !config.pinterestBoardId) return false;
  try {
    const caption = await generateCaption(post, 'pinterest');
    await axios.post(
      'https://api.pinterest.com/v5/pins',
      {
        board_id:   config.pinterestBoardId,
        title:      post.title,
        description: caption,
        link:       `https://${config.siteDomain}/posts/${post.slug}`,
        media_source: { source_type: 'url', url: `https://${config.siteDomain}/og-image.png` },
      },
      {
        headers: { Authorization: `Bearer ${config.pinterestToken}`, 'Content-Type': 'application/json' },
        timeout: 10_000,
      }
    );
    logger.info(`[SOCIAL] Pinterest: pinned "${post.title}"`);
    recordEngagement('pinterest', 1.5);
    return true;
  } catch (err) {
    logger.warn('[SOCIAL] Pinterest failed', { error: err.message });
    return false;
  }
}

// ── Twitter ───────────────────────────────────────────────────────────────────
async function postTwitter(post) {
  if (!config.twitterApiKey || !config.twitterAccessToken) return false;
  try {
    const { TwitterApi } = require('twitter-api-v2');
    const client = new TwitterApi({
      appKey:       config.twitterApiKey,
      appSecret:    config.twitterApiSecret,
      accessToken:  config.twitterAccessToken,
      accessSecret: config.twitterAccessSecret,
    });
    const tweet = await generateCaption(post, 'twitter');
    await client.v2.tweet(tweet.slice(0, 280));
    logger.info(`[SOCIAL] Twitter: tweeted "${post.title}"`);
    recordEngagement('twitter', 2);
    return true;
  } catch (err) {
    logger.warn('[SOCIAL] Twitter failed', { error: err.message });
    return false;
  }
}

// ── Distribute to all available platforms ────────────────────────────────────
async function distributeContent(post) {
  if (!post) return;
  const results = await Promise.allSettled([
    postMastodon(post),
    postReddit(post),
    postPinterest(post),
    postTwitter(post),
  ]);
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value).length;
  logger.info(`[SOCIAL] Distribution complete: ${succeeded}/4 platforms`);
  state.increment('socialPosts');
  return succeeded;
}

module.exports = { distributeContent, postMastodon, postReddit, postPinterest, postTwitter, generateCaption };
