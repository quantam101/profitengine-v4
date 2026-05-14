'use strict';
const state = require('../utils/state');

describe('State', () => {
  test('get returns default for missing key', () => {
    expect(state.get('nonexistent_key_xyz', 'default')).toBe('default');
  });

  test('set and get round-trip', () => {
    state.set('test_key_abc', 42);
    expect(state.get('test_key_abc')).toBe(42);
  });

  test('increment works', () => {
    state.set('test_counter', 10);
    const result = state.increment('test_counter', 5);
    expect(result).toBe(15);
  });

  test('push maintains maxLen', () => {
    state.set('test_arr', []);
    for (let i = 0; i < 5; i++) state.push('test_arr', i, 3);
    expect(state.get('test_arr').length).toBe(3);
  });

  test('refuses to persist sensitive keys', () => {
    expect(() => state.set('api_key', 'secret')).toThrow();
    expect(() => state.set('myPassword', 'secret')).toThrow();
  });
});
