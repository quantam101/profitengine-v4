'use strict';
const publisher = require('../publishers');

describe('Publisher', () => {
  test('returns capped response when post is null', async () => {
    const result = await publisher.publish(null);
    expect(result.published).toBe(0);
  });

  test('platformStats returns array', () => {
    const stats = publisher.platformStats();
    expect(Array.isArray(stats)).toBe(true);
    stats.forEach(p => {
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('enabled');
      expect(p).toHaveProperty('successRate');
    });
  });

  test('respects daily cap', async () => {
    const state = require('../utils/state');
    const today = new Date().toISOString().slice(0,10);
    state.set(`posts_today_${today}`, 9999);
    const result = await publisher.publish({ title: 'test', body: 'body' });
    expect(result.capped).toBe(true);
    state.set(`posts_today_${today}`, 0);
  });
});
