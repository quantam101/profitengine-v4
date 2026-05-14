'use strict';
/**
 * utils/llm.js — ProfitEngine v4.0
 * Groq → OpenRouter → Gemini fallback chain.
 * Circuit breaker per provider. Token budget tracking.
 */
const axios   = require('axios');
const logger  = require('./logger');
const state   = require('./state');

const CB = {};
function getBreaker(name) {
  if (!CB[name]) CB[name] = { failures: 0, openUntil: 0 };
  return CB[name];
}
function recordFailure(name) {
  const b = getBreaker(name);
  b.failures++;
  if (b.failures >= 3) {
    b.openUntil = Date.now() + 60_000 * b.failures;
    logger.warn(`[LLM] Circuit OPEN: ${name} until ${new Date(b.openUntil).toISOString()}`);
  }
}
function recordSuccess(name) { CB[name] = { failures: 0, openUntil: 0 }; }
function isOpen(name) { return getBreaker(name).openUntil > Date.now(); }

function trackTokens(provider, prompt, completion) {
  const key = `tokens_${new Date().toISOString().slice(0,10)}`;
  const d = state.get(key, { total: 0, byProvider: {} });
  d.total += prompt + completion;
  d.byProvider[provider] = (d.byProvider[provider] || 0) + prompt + completion;
  state.set(key, d);
}

async function callGroq(prompt, system, model = 'llama-3.3-70b-versatile', maxTokens = 1500) {
  const key = process.env.GROQ_API_KEY;
  if (!key || isOpen('groq')) throw new Error('groq unavailable');
  try {
    const msgs = system ? [{ role:'system', content:system },{ role:'user', content:prompt }]
                        : [{ role:'user', content:prompt }];
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions',
      { model, messages: msgs, max_tokens: maxTokens, temperature: 0.7 },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 45000 });
    const u = res.data.usage || {};
    trackTokens('groq', u.prompt_tokens||0, u.completion_tokens||0);
    recordSuccess('groq');
    return res.data.choices[0].message.content.trim();
  } catch (e) { recordFailure('groq'); throw e; }
}

async function callOpenRouter(prompt, system, model = 'meta-llama/llama-3.3-70b-instruct', maxTokens = 1500) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || isOpen('openrouter')) throw new Error('openrouter unavailable');
  try {
    const msgs = system ? [{ role:'system', content:system },{ role:'user', content:prompt }]
                        : [{ role:'user', content:prompt }];
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions',
      { model, messages: msgs, max_tokens: maxTokens },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
          'HTTP-Referer': 'https://alreadyherellc.com', 'X-Title': 'ProfitEngine' }, timeout: 60000 });
    const u = res.data.usage || {};
    trackTokens('openrouter', u.prompt_tokens||0, u.completion_tokens||0);
    recordSuccess('openrouter');
    return res.data.choices[0].message.content.trim();
  } catch (e) { recordFailure('openrouter'); throw e; }
}

async function callGemini(prompt, system, maxTokens = 1500) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || isOpen('gemini')) throw new Error('gemini unavailable');
  try {
    const contents = system
      ? [{ role:'user', parts:[{ text:`[System]: ${system}` }] },{ role:'user', parts:[{ text:prompt }] }]
      : [{ role:'user', parts:[{ text:prompt }] }];
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      { contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 } },
      { timeout: 60000 });
    trackTokens('gemini', 0, 0);
    recordSuccess('gemini');
    return (res.data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  } catch (e) { recordFailure('gemini'); throw e; }
}

async function callFast(prompt, system, maxTokens = 600) {
  const errs = [];
  try { return await callGroq(prompt, system, 'gemma2-9b-it', maxTokens); } catch(e){ errs.push(e.message); }
  try { return await callOpenRouter(prompt, system, 'google/gemma-2-9b-it', maxTokens); } catch(e){ errs.push(e.message); }
  try { return await callGemini(prompt, system, maxTokens); } catch(e){ errs.push(e.message); }
  throw new Error(`All fast providers failed: ${errs.join(' | ')}`);
}

async function generate(prompt, system = null, maxTokens = 1500) {
  const errs = [];
  try { return await callGroq(prompt, system, 'llama-3.3-70b-versatile', maxTokens); } catch(e){ errs.push(e.message); }
  try { return await callOpenRouter(prompt, system, 'meta-llama/llama-3.3-70b-instruct', maxTokens); } catch(e){ errs.push(e.message); }
  try { return await callGemini(prompt, system, maxTokens); } catch(e){ errs.push(e.message); }
  throw new Error(`All LLM providers failed: ${errs.join(' | ')}`);
}

async function generateJSON(prompt, useFast = false) {
  const sys = 'Respond ONLY with valid JSON. No markdown, no backticks, no preamble.';
  const raw = await (useFast ? callFast : generate)(prompt, sys, 1000);
  const clean = raw.replace(/```json|```/gi,'').trim();
  try { return JSON.parse(clean); } catch {
    const m = clean.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (m) return JSON.parse(m[1]);
    throw new Error(`Invalid JSON from LLM: ${clean.slice(0,200)}`);
  }
}

function todayTokens() {
  return state.get(`tokens_${new Date().toISOString().slice(0,10)}`, { total:0, byProvider:{} });
}
function circuitStatus() {
  return Object.entries(CB).map(([name,b]) => ({
    provider: name, open: b.openUntil > Date.now(), failures: b.failures
  }));
}

module.exports = { generate, generateJSON, callFast, callGroq, callOpenRouter, callGemini, todayTokens, circuitStatus };
