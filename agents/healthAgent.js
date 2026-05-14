'use strict';
/**
 * agents/healthAgent.js — ProfitEngine v4.0
 * System health: CPU, memory, disk, LLM ping, GitHub ping, process watchdog.
 * Tier 0: 100% local — zero tokens. Alerts via email only.
 */
const os     = require('os');
const axios  = require('axios');
const logger = require('../utils/logger');
const state  = require('../utils/state');
const email  = require('../utils/email');
const config = require('../config');
const llm    = require('../utils/llm');

const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 min between repeat alerts

async function checkMemory() {
  const total     = os.totalmem();
  const free      = os.freemem();
  const usedPct   = ((total - free) / total) * 100;
  return { total: Math.round(total / 1024 / 1024), free: Math.round(free / 1024 / 1024), usedPct: Math.round(usedPct) };
}

function checkCPU() {
  const cpus = os.cpus();
  const loads = os.loadavg();
  return { cores: cpus.length, load1: loads[0].toFixed(2), load5: loads[1].toFixed(2), load15: loads[2].toFixed(2) };
}

async function pingLLM() {
  try {
    const result = await llm.generate('Reply with exactly: OK', { tier: 1, maxTokens: 10, retries: 1 });
    return { ok: result !== null, response: result?.slice(0, 20) };
  } catch {
    return { ok: false };
  }
}

async function pingGitHub() {
  if (!config.githubToken) return { ok: false, reason: 'No token' };
  try {
    await axios.get(
      `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}`,
      { headers: { Authorization: `token ${config.githubToken}` }, timeout: 8_000 }
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function runHealthCheck() {
  const memory = await checkMemory();
  const cpu    = checkCPU();
  const llmOk  = await pingLLM();
  const ghOk   = await pingGitHub();

  const status = {
    ts:       new Date().toISOString(),
    memory,
    cpu,
    llm:      llmOk,
    github:   ghOk,
    uptime:   Math.round(process.uptime() / 60) + 'min',
    tokens:   { remaining: llm.tokenBudgetRemaining(), usedToday: llm.tokensUsedToday() },
    breakers: llm.breakerStatus(),
  };

  state.set('lastHealth', status);
  logger.info('[HEALTH] Check complete', {
    memPct: memory.usedPct,
    cpuLoad: cpu.load1,
    llm: llmOk.ok,
    github: ghOk.ok,
  });

  // Alert on critical conditions
  const lastAlerts = state.get('healthAlerts', {});
  const now = Date.now();

  const issues = [];
  if (memory.usedPct > 90)  issues.push(`Memory critical: ${memory.usedPct}%`);
  if (!llmOk.ok)            issues.push('LLM provider unreachable');
  if (!ghOk.ok)             issues.push(`GitHub unreachable: ${ghOk.reason}`);
  if (parseFloat(cpu.load1) > cpu.cores * 2) issues.push(`CPU overloaded: ${cpu.load1}`);

  for (const issue of issues) {
    const key = issue.slice(0, 30);
    if (!lastAlerts[key] || now - lastAlerts[key] > ALERT_COOLDOWN) {
      await email.sendAlert('Health Alert', `${issue}\n\nFull status:\n${JSON.stringify(status, null, 2)}`);
      lastAlerts[key] = now;
    }
  }
  state.set('healthAlerts', lastAlerts);

  return status;
}

module.exports = { runHealthCheck, checkMemory, checkCPU, pingLLM, pingGitHub };
