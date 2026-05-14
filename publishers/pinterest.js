'use strict';
/**
 * publishers/pinterest.js - ProfitEngine v4.0
 * Pinterest Pin creation via v5 API with AI-generated description.
 */
const axios  = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
const llm    = require('../utils/llm');

async function buildDescription(post) {
  const prompt = `Write a Pinterest pin description (max 500 chars) for this blog post.
Title: "${post.title}" | Niche: ${post.niche || 'passive income'}
Include 5 relevant keywords naturally. No hashtags. Focus on value.`;
  try { return (await llm.callFast(prompt, null, 150)).slice(0, 500); }
  catch { return post.metaDescription || post.title; }
}

async function publish(post) {
  if (!config.pinterestToken || !config.pinterestBoardId) return false;
  const description = await buildDescription(post);
  const link = `https://${config.siteDomain}/${post.slug || ''}`;
  try {
    const res = await axios.post(
      'https://api.pinterest.com/v5/pins',
      {
        board_id:  config.pinterestBoardId,
        title:     post.title.slice(0, 100),
        description,
        link,
        media_source: { source_type: 'image_url', url: `https://${config.siteDomain}/og-default.jpg` },
      },
      { headers: { Authorization: `Bearer ${config.pinterestToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    logger.info(`[PINTEREST] Pinned: ${res.data?.id}`);
    return `https://pinterest.com/pin/${res.data?.id}`;
  } catch (err) {
    logger.warn(`[PINTEREST] Failed: ${err.message}`);
    return false;
  }
}
module.exports = { publish };
