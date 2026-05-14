'use strict';
const cache   = require('../utils/distillation/cache');
const distill = require('../utils/distillation');

describe('Distillation Cache', () => {
  test('returns null for missing key', () => {
    expect(cache.get('nonexistent_cache_key_xyz')).toBeNull();
  });

  test('set and get with TTL', () => {
    cache.set('test_cache_key', { data: 42 }, 60);
    const result = cache.get('test_cache_key');
    expect(result).not.toBeNull();
    expect(result.data).toBe(42);
  });

  test('stats returns object', () => {
    const s = cache.stats();
    expect(s).toHaveProperty('hotActive');
    expect(s).toHaveProperty('diskActive');
  });
});

describe('Distillation utils', () => {
  test('stripHtml removes tags', () => {
    expect(distill.stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  test('dedup removes duplicates', () => {
    const result = distill.dedup(['a', 'b', 'a', 'c', 'B']);
    expect(result).toHaveLength(3);
  });

  test('compressTrends formats correctly', () => {
    const trends = [{ title: 'test', source: 'google', score: 90 }];
    const result = distill.compressTrends(trends);
    expect(result).toContain('test');
    expect(result).toContain('google');
  });
});
