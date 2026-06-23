'use strict';
/**
 * utils/contentIdentity.js — ProfitEngine v4.0
 * Stable duplicate detection for generated, website, and social publishing.
 *
 * The publisher must not treat a rewritten title, A/B headline, or refreshed
 * front matter as a new asset. This module creates a canonical topic identity
 * and compares recent records by token overlap so repeated trend scans do not
 * spam the same URL/channel.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in',
  'into', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with', 'your', 'you',
  'that', 'this', 'using', 'use', 'guide', 'step', 'steps', 'best', 'top',
  'ultimate', 'complete', 'proven', 'easy', 'fast', 'free', 'make', 'money',
  'boost', 'online', 'income', 'maximizing', 'revenue', '2024', '2025', '2026',
]);

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleFrom(input) {
  if (!input) return '';
  return input.canonicalTopic || input.topic || input.trend?.title || input.sourceTitle || input.title || '';
}

function slugify(value, maxLen = 96) {
  const slug = normalizeTitle(value).replace(/\s+/g, '-').replace(/^-|-$/g, '');
  return slug.slice(0, maxLen).replace(/-+$/g, '');
}

function tokens(value) {
  return normalizeTitle(value)
    .split(' ')
    .filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

function fingerprint(value) {
  return [...new Set(tokens(value))].sort().join('|');
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / new Set([...a, ...b]).size;
}

function identityFor(input) {
  const title = titleFrom(input);
  return {
    title,
    normalizedTitle: normalizeTitle(title),
    slug: slugify(title),
    fingerprint: fingerprint(title),
    tokens: tokens(title),
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function flattenRecords(...groups) {
  return groups.flatMap(group => asArray(group)).filter(Boolean);
}

function recordTitle(record) {
  if (!record) return '';
  return record.canonicalTopic || record.topic || record.sourceTitle || record.title || record.slug || record.url || '';
}

function isLikelyDuplicate(candidate, record, threshold = 0.65) {
  const candidateId = identityFor(candidate);
  const recordId = identityFor({ title: recordTitle(record) });

  if (!candidateId.normalizedTitle || !recordId.normalizedTitle) return false;
  if (candidateId.normalizedTitle === recordId.normalizedTitle) return true;
  if (candidateId.slug && candidateId.slug === recordId.slug) return true;
  if (candidateId.fingerprint && candidateId.fingerprint === recordId.fingerprint) return true;

  return jaccard(candidateId.tokens, recordId.tokens) >= threshold;
}

function findDuplicate(candidate, records, threshold = 0.65) {
  return asArray(records).find(record => isLikelyDuplicate(candidate, record, threshold)) || null;
}

function buildRecord(input, extra = {}) {
  const id = identityFor(input);
  return {
    key: id.fingerprint || id.slug,
    title: id.title,
    slug: id.slug,
    fingerprint: id.fingerprint,
    sourceTitle: input?.trend?.title || input?.sourceTitle || id.title,
    ts: new Date().toISOString(),
    ...extra,
  };
}

module.exports = {
  normalizeTitle,
  slugify,
  tokens,
  fingerprint,
  identityFor,
  flattenRecords,
  findDuplicate,
  isLikelyDuplicate,
  buildRecord,
};
