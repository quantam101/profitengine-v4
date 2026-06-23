'use strict';

const contentIdentity = require('./contentIdentity');

describe('contentIdentity', () => {
  test('detects A/B headline rewrites as the same topic', () => {
    const original = {
      title: 'Best Platforms for Selling AI Prompts and Automation Scripts',
    };
    const rewrite = {
      title: 'Maximizing Revenue with AI: Best Platforms for Selling AI Prompts and Automation Scripts',
    };

    expect(contentIdentity.isLikelyDuplicate(rewrite, original)).toBe(true);
  });

  test('detects subtitle variants as the same topic', () => {
    const original = {
      title: 'Best Platforms for Selling AI Prompts and Automation Scripts',
    };
    const rewrite = {
      title: 'Best Platforms for Selling AI Prompts and Automation Scripts: Boost Your Online Income',
    };

    expect(contentIdentity.isLikelyDuplicate(rewrite, original)).toBe(true);
  });

  test('does not collapse unrelated topics', () => {
    const first = { title: 'Best Platforms for Selling AI Prompts and Automation Scripts' };
    const second = { title: 'Cloudflare Workers: Build and Deploy APIs at No Cost' };

    expect(contentIdentity.isLikelyDuplicate(first, second)).toBe(false);
  });

  test('uses original trend title as canonical title when available', () => {
    const record = contentIdentity.buildRecord({
      title: 'A/B Winner Headline',
      trend: { title: 'Original Trend Topic' },
    });

    expect(record.sourceTitle).toBe('Original Trend Topic');
  });
});
