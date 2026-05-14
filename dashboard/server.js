'use strict';
/**
 * dashboard/server.js - ProfitEngine v4.0
 * Express dashboard: auth-protected, live metrics, AI insights panel.
 * Claude API (claude-sonnet-4-20250514) embedded for conversational analysis.
 * Auto-launches on start.
 */
const express    = require('express');
const path       = require('path');
const axios      = require('axios');
const state      = require('../utils/state');
const logger     = require('../utils/logger');
const config     = require('../config');
const llm        = require('../utils/llm');
const publisher  = require('../publishers');
const autoScale  = require('../ultraflow/autoScale');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Basic Auth ────────────────────────────────────────────────────────────────
function basicAuth(req, res, next) {
  const user = config.dashUser;
  const pass = config.dashPass;
  if (!user || !pass) return next(); // open if not configured
  const auth = req.headers.authorization || '';
  const [type, creds] = auth.split(' ');
  if (type !== 'Basic') return res.status(401).set('WWW-Authenticate', 'Basic realm="ProfitEngine"').send('Auth required');
  const [u, p] = Buffer.from(creds || '', 'base64').toString().split(':');
  if (u === user && p === pass) return next();
  return res.status(401).set('WWW-Authenticate', 'Basic realm="ProfitEngine"').send('Invalid credentials');
}

app.use('/api', basicAuth);
app.use('/', basicAuth);

// ── API Endpoints ──────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const all = state.getAll();
  res.json({
    ok: true,
    uptime: process.uptime(),
    startedAt:        all.startedAt,
    lastCycle:        all.lastCycleSummary,
    lastTrendScan:    all.lastTrendScan,
    latestTrends:     (all.latestTrends || []).slice(0,5),
    totalGenerated:   all.totalPostsGenerated || 0,
    totalPublished:   all.totalPostsPublished || 0,
    totalTrends:      all.totalTrendsScanned || 0,
    publishedPosts:   (all.publishedPosts || []).slice(-10),
    deadLetterQueue:  (all.deadLetterQueue || []).length,
    tokenUsage:       llm.todayTokens(),
    circuits:         llm.circuitStatus(),
    autoScale:        autoScale.status(),
    platformStats:    publisher.platformStats(),
    healthReport:     all.lastImprovementReport,
    cacheStats:       require('../utils/distillation/cache').stats(),
  });
});

app.get('/api/revenue', (req, res) => {
  res.json({
    events:  (state.get('revenueEvents', [])).slice(-50),
    summary: state.get('revenueSummary', {}),
  });
});

app.get('/api/posts', (req, res) => {
  const published = state.get('publishedPosts', []);
  const log       = state.get('publishLog', []);
  res.json({ published: published.slice(-30), log: log.slice(-20) });
});

app.get('/api/trends', (req, res) => {
  res.json({
    latest:    state.get('latestTrends', []),
    keywords:  state.get('latestKeywords', []),
    lastScan:  state.get('lastTrendScan'),
  });
});

app.get('/api/health', (req, res) => {
  const report = state.get('lastImprovementReport', {});
  res.json({
    score:    report.healthScore || 0,
    summary:  report.summary || 'No report yet',
    issues:   report.criticalIssues || [],
    lastRun:  report.generatedAt || null,
  });
});

// ── AI Insights (Claude API) ─────────────────────────────────────────────────
app.post('/api/ask', async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question required' });

  const metrics = {
    generated: state.get('totalPostsGenerated', 0),
    published: state.get('totalPostsPublished', 0),
    trends:    state.get('totalTrendsScanned', 0),
    revenue:   state.get('revenueSummary', {}),
    health:    state.get('lastImprovementReport', {}),
    circuits:  llm.circuitStatus(),
    autoScale: autoScale.status(),
  };

  try {
    const answer = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are the AI operations advisor for ProfitEngine v4.0, an autonomous content monetization system for ${config.businessName} (${config.siteDomain}).
Current system metrics: ${JSON.stringify(metrics)}
Be concise, direct, and actionable. Focus on revenue impact and system health.`,
      messages: [{ role: 'user', content: question }],
    }, {
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
      timeout: 30000,
    });
    const text = answer.data.content?.find(b => b.type === 'text')?.text || '';
    res.json({ answer: text });
  } catch (err) {
    // Fallback to local LLM
    try {
      const fallback = await llm.generate(`${question}\n\nContext: ${JSON.stringify(metrics)}`, null, 800);
      res.json({ answer: fallback, source: 'local' });
    } catch {
      res.status(500).json({ error: 'AI advisor unavailable' });
    }
  }
});

// ── Manual Triggers ────────────────────────────────────────────────────────────
app.post('/api/run-cycle', async (req, res) => {
  try {
    const scheduler = require('../scheduler');
    res.json({ ok: true, message: 'Cycle triggered' });
    setImmediate(() => scheduler.runPipeline().catch(e => logger.error('[DASH] Manual cycle failed', { error: e.message })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/run-improve', async (req, res) => {
  try {
    const scheduler = require('../scheduler');
    res.json({ ok: true, message: 'Self-improvement triggered' });
    setImmediate(() => scheduler.runSelfImprovement().catch(() => {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve Dashboard HTML ───────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function start(port) {
  const p = port || config.port || 3000;
  app.listen(p, () => {
    logger.info(`[DASHBOARD] Live at http://localhost:${p}`);
  });
}

module.exports = { app, start };
