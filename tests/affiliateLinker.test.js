'use strict';
const linker = require('../agents/affiliateLinker');

describe('AffiliateLinker', () => {
  test('injectLinks replaces [AMAZON_LINK] placeholder', () => {
    const { text, linksInjected } = linker.injectLinks('Buy here: [AMAZON_LINK]');
    expect(text).toContain('amazon.com');
    expect(linksInjected).toBeGreaterThan(0);
  });

  test('buildLink generates valid amazon URL', () => {
    const url = linker.buildLink('ring light');
    expect(url).toContain('amazon.com');
    expect(url).toContain('alreadyhere-20');
  });

  test('buildProductSection returns markdown list', () => {
    const section = linker.buildProductSection(['tripod', 'microphone']);
    expect(section).toContain('## Recommended Products');
    expect(section).toContain('amazon.com');
    expect(section).toContain('Amazon Associate');
  });

  test('processPost injects links into body', () => {
    const post = { title: 'Test', body: 'Get a ring light [AMAZON_LINK] today.', trend: {} };
    const result = linker.processPost(post);
    expect(result.body).toContain('amazon.com');
    expect(result.linksInjected).toBeGreaterThan(0);
  });
});
