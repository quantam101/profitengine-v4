'use strict';
/**
 * publishers/reddit.js - ProfitEngine v4.0
 * Reddit post via OAuth2 (password grant). Niche -> subreddit map. Rate-limited.
 */
const axios  = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
const state  = require('../utils/state');

const NICHE_SUBREDDITS = {
  'passive income':      'passive_income',
  'ai tools':            'artificial',
  'side hustle':         'sidehustle',
  'print on demand':     'printondemand',
  'affiliate marketing': 'affiliatemarketing',
  'blogging':            'blogging',
};

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  if (!config.redditClientId || !config.redditPassword) return null;
  try {
    const res = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      `grant_type=password&username=${encodeURIComponent(config.redditUsername)}&password=${encodeURIComponent(config.redditPassword)}`,
      {
        auth: { username: config.redditClientId, password: config.redditClientSecret },
        headers: { 'User-Agent': 'ProfitEngine/4.0', 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      }
    );
    _token = res.data.access_token;
    _tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    return _token;
  } catch (err) {
    logger.warn(`[REDDIT] Auth failed: ${err.message}`);
    return null;
  }
}

async function publish(post) {
  if (!config.redditClientId) return false;
  const token = await getToken();
  if (!token) return false;

  // Rate limit: 1 post per subreddit per 10 min
  const subreddit = NICHE_SUBREDDITS[post.niche] || 'passive_income';
  const rKey = `reddit_last_${subreddit}`;
  const last = state.get(rKey, 0);
  if (Date.now() - last < 10 * 60 * 1000) {
    logger.debug(`[REDDIT] Rate limited for r/${subreddit}`);
    return false;
  }

  try {
    const res = await axios.post(
      'https://oauth.reddit.com/api/submit',
      new URLSearchParams({
        sr: subreddit, kind: 'self', title: post.title.slice(0, 300),
        text: post.body.slice(0, 10000), resubmit: 'true', nsfw: 'false', spoiler: 'false',
      }).toString(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'ProfitEngine/4.0',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
      }
    );
    const url = res.data?.json?.data?.url;
    state.set(rKey, Date.now());
    logger.info(`[REDDIT] Posted to r/${subreddit}: ${url}`);
    return url;
  } catch (err) {
    logger.warn(`[REDDIT] Post failed: ${err.message}`);
    return false;
  }
}
module.exports = { publish };
