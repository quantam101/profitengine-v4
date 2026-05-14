'use strict';
const axios  = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

async function publish(post) {
  if (!config.devtoApiKey) return false;
  try {
    const res = await axios.post(
      'https://dev.to/api/articles',
      {
        article: {
          title:        post.title,
          body_markdown: post.body,
          published:    true,
          tags:         (post.tags || []).slice(0, 4).map(t => t.replace(/\s+/g, '').toLowerCase().slice(0, 30)),
          description:  post.metaDescription || post.title,
          canonical_url: `https://${config.siteDomain}/posts/${post.slug}`,
        },
      },
      { headers: { 'api-key': config.devtoApiKey, 'Content-Type': 'application/json' }, timeout: 15_000 }
    );
    logger.info(`[DEV.TO] Published: ${post.title} → ${res.data.url}`);
    return res.data.url;
  } catch (err) {
    logger.warn('[DEV.TO] Publish failed', { error: err.message });
    return false;
  }
}

module.exports = { publish };
