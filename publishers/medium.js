'use strict';
/**
 * publishers/medium.js - ProfitEngine v4.0
 * Medium REST API publish with canonical URL + tag normalization.
 */
const axios  = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

async function getAuthorId() {
  if (config.mediumAuthorId) return config.mediumAuthorId;
  const res = await axios.get('https://api.medium.com/v1/me',
    { headers: { Authorization: `Bearer ${config.mediumApiKey}` }, timeout: 10000 });
  return res.data?.data?.id;
}

async function publish(post) {
  if (!config.mediumApiKey) return false;
  try {
    const authorId = await getAuthorId();
    const tags = (post.keywords || post.tags || [])
      .slice(0,5).map(t => t.replace(/[^a-zA-Z0-9\s]/g,'').slice(0,25)).filter(Boolean);
    const res = await axios.post(
      `https://api.medium.com/v1/users/${authorId}/posts`,
      {
        title:         post.title,
        contentFormat: 'markdown',
        content:       post.body,
        tags,
        publishStatus: 'public',
        canonicalUrl:  `https://${config.siteDomain}/${post.slug || ''}`,
        notifyFollowers: true,
      },
      { headers: { Authorization: `Bearer ${config.mediumApiKey}`, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    const url = res.data?.data?.url;
    logger.info(`[MEDIUM] Published: ${post.title} -> ${url}`);
    return url;
  } catch (err) {
    logger.warn(`[MEDIUM] Publish failed: ${err.message}`);
    return false;
  }
}
module.exports = { publish };
