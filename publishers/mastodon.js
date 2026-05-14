'use strict';
/**
 * publishers/mastodon.js - ProfitEngine v4.0
 * Mastodon toot with hashtag injection. 500 char limit enforced.
 */
const axios  = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
const llm    = require('../utils/llm');

async function generateToot(post) {
  const prompt = `Write a Mastodon post (max 450 chars) promoting this blog post.
Title: "${post.title}"
Include 3-5 relevant hashtags. Be conversational, no hype.
End with the URL placeholder: {URL}`;
  try {
    return await llm.callFast(prompt, null, 200);
  } catch {
    return `${post.title.slice(0, 200)}\n\nNew post on ${config.siteDomain}\n{URL}`;
  }
}

async function publish(post) {
  if (!config.mastodonAccessToken) return false;
  const postUrl = `https://${config.siteDomain}/${post.slug || ''}`;
  let status = await generateToot(post);
  status = status.replace('{URL}', postUrl);
  if (status.length > 490) status = status.slice(0, 487) + '...';

  try {
    const res = await axios.post(
      `https://${config.mastodonInstance}/api/v1/statuses`,
      { status, visibility: 'public' },
      { headers: { Authorization: `Bearer ${config.mastodonAccessToken}`, 'Content-Type': 'application/json' }, timeout: 12000 }
    );
    const url = res.data?.url;
    logger.info(`[MASTODON] Tooted: ${url}`);
    return url;
  } catch (err) {
    logger.warn(`[MASTODON] Failed: ${err.message}`);
    return false;
  }
}
module.exports = { publish };
