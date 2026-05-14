'use strict';
/**
 * publishers/hashnode.js - ProfitEngine v4.0
 * Hashnode GraphQL publish with retry + canonical URL.
 */
const axios  = require('axios');
const logger = require('../utils/logger');
const config = require('../config');

const GQL = `mutation PublishPost($input: PublishPostInput!) {
  publishPost(input: $input) { post { id url title } } }`;

async function publish(post) {
  if (!config.hashnodeApiKey || !config.hashnodePublicationId) return false;
  const tags = (post.keywords || post.tags || []).slice(0,5)
    .map(t => ({ name: t.slice(0,20), slug: t.toLowerCase().replace(/\s+/g,'-').slice(0,20) }));
  const input = {
    title: post.title,
    contentMarkdown: post.body,
    tags,
    publicationId: config.hashnodePublicationId,
    metaTags: { title: post.title, description: (post.metaDescription || post.title).slice(0,150) },
    originalArticleURL: `https://${config.siteDomain}/${post.slug || ''}`,
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post('https://gql.hashnode.com',
        { query: GQL, variables: { input } },
        { headers: { Authorization: config.hashnodeApiKey, 'Content-Type': 'application/json' }, timeout: 20000 });
      if (res.data?.errors?.length) throw new Error(res.data.errors[0].message);
      const url = res.data?.data?.publishPost?.post?.url;
      logger.info(`[HASHNODE] Published: ${post.title} -> ${url}`);
      return url;
    } catch (err) {
      logger.warn(`[HASHNODE] Attempt ${attempt}: ${err.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 4000 * attempt));
    }
  }
  return false;
}
module.exports = { publish };
