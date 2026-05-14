'use strict';
/**
 * agents/affiliateLinker.js — ProfitEngine v4.0
 * Tier 0 only — pure regex, zero tokens.
 * Amazon affiliate link injection + product section builder.
 */
const logger = require('../utils/logger');
const config = require('../config');

const PRODUCT_MAP = {
  'ring light': 'ring+light+for+streaming',
  'tripod': 'camera+tripod+flexible',
  'microphone': 'usb+condenser+microphone',
  'laptop stand': 'adjustable+laptop+stand',
  'webcam': 'hd+webcam+1080p',
  'canva pro': 'canva+pro+graphic+design',
  'web hosting': 'web+hosting+plan',
  'hosting': 'web+hosting+plan',
  'keyboard': 'mechanical+keyboard+wireless',
  'monitor': 'monitor+home+office+27+inch',
  'desk': 'adjustable+standing+desk',
  'chair': 'ergonomic+office+chair',
  'headphones': 'noise+cancelling+headphones',
  'printer': 'all+in+one+printer+wireless',
  'camera': 'vlogging+camera+4k',
};

function buildLink(product) {
  const tag = config.amazonTag || 'alreadyhere-20';
  const term = PRODUCT_MAP[product.toLowerCase()] || encodeURIComponent(product);
  return `https://www.amazon.com/s?k=${term}&tag=${tag}`;
}

function injectLinks(bodyText) {
  if (!bodyText) return { text: bodyText, linksInjected: 0 };
  let text = bodyText;
  let linksInjected = 0;

  // Replace [AMAZON_LINK] placeholders
  text = text.replace(/\[AMAZON_LINK\]/gi, () => {
    const product = config.affiliateProducts[linksInjected % config.affiliateProducts.length];
    linksInjected++;
    return buildLink(product);
  });

  // Inject inline links for product mentions (max 2 per product)
  for (const product of config.affiliateProducts) {
    const escaped = product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!\\[)(\\b${escaped}\\b)(?![\\]\\(])`, 'gi');
    let count = 0;
    text = text.replace(regex, match => {
      if (count >= 2) return match;
      count++;
      linksInjected++;
      return `[${match}](${buildLink(product.toLowerCase())})`;
    });
  }

  if (linksInjected > 0) {
    logger.debug(`[AffiliateLinker] Injected ${linksInjected} links`);
  }
  return { text, linksInjected };
}

function buildProductSection(products = []) {
  const list = products.length ? products : config.affiliateProducts.slice(0, 3);
  const lines = list.map(p =>
    `- **[${p}](${buildLink(p.toLowerCase())})** — Top-rated option on Amazon`
  );
  return `\n\n## Recommended Products\n\n${lines.join('\n')}\n\n*As an Amazon Associate, I earn from qualifying purchases at no extra cost to you.*\n`;
}

function processPost(post) {
  if (!post?.body) return post;
  const { text, linksInjected } = injectLinks(post.body);
  const withSection = text + buildProductSection(post.trend?.affiliateProducts);
  return { ...post, body: withSection, linksInjected };
}

module.exports = { injectLinks, buildProductSection, buildLink, processPost };
