'use strict';
/**
 * tests/llm.test.js - ProfitEngine v4.0
 * Unit tests: LLM fallback chain, circuit breaker, JSON parsing.
 */
const llm = require('../utils/llm');

describe('LLM Circuit Breaker', () => {
  test('circuitStatus returns array', () => {
    const s = llm.circuitStatus();
    expect(Array.isArray(s)).toBe(true);
  });

  test('todayTokens returns object with total', () => {
    const t = llm.todayTokens();
    expect(t).toHaveProperty('total');
    expect(typeof t.total).toBe('number');
  });
});

describe('LLM generateJSON', () => {
  test('parses clean JSON response', async () => {
    // Mock: replace generate with stub
    const orig = llm.callFast;
    llm.callFast = async () => '[{"title":"test","score":80}]';
    const result = await llm.generateJSON('test prompt', true);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].title).toBe('test');
    llm.callFast = orig;
  });

  test('strips markdown fences from JSON', async () => {
    const orig = llm.callFast;
    llm.callFast = async () => '```json\n{"key":"val"}\n```';
    const result = await llm.generateJSON('test', true);
    expect(result.key).toBe('val');
    llm.callFast = orig;
  });
});
