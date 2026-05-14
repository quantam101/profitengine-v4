'use strict';
/**
 * ultraflow/bridge.js - ProfitEngine v4.0
 * UltraFlow VHLL telemetry bridge.
 * Batches events, retries on failure, circuit-breaks on persistent errors.
 * Never blocks the main pipeline — all sends are fire-and-forget with queuing.
 */
const axios  = require('axios');
const logger = require('../utils/logger');
const state  = require('../utils/state');

let _failures = 0;
let _openUntil = 0;
const BATCH_SIZE   = 20;
const FLUSH_MS     = 30_000;
let _queue         = [];
let _flushTimer    = null;

function isOpen() { return _openUntil > Date.now(); }

function circuitBreak() {
  _failures++;
  if (_failures >= 5) {
    _openUntil = Date.now() + Math.min(300_000, 60_000 * _failures);
    logger.warn(`[ULTRAFLOW] Circuit open until ${new Date(_openUntil).toISOString()}`);
  }
}

function circuitReset() { _failures = 0; _openUntil = 0; }

async function flushQueue() {
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  if (!_queue.length) return;
  const url    = process.env.ULTRAFLOW_URL;
  const apiKey = process.env.ULTRAFLOW_API_KEY;
  if (!url || !apiKey || isOpen()) return;

  const batch = _queue.splice(0, BATCH_SIZE);
  try {
    await axios.post(`${url}/api/v1/events/batch`, { events: batch }, {
      headers: { 'X-TG-Token': apiKey, 'Content-Type': 'application/json', 'X-Source': 'ProfitEngine/4.0' },
      timeout: 10000,
    });
    circuitReset();
    logger.debug(`[ULTRAFLOW] Flushed ${batch.length} events`);
  } catch (err) {
    _queue.unshift(...batch); // put back
    circuitBreak();
    logger.warn(`[ULTRAFLOW] Flush failed: ${err.message}`);
  }
}

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(flushQueue, FLUSH_MS);
}

function emit(eventType, data = {}) {
  const event = {
    type:      eventType,
    source:    'profitengine',
    timestamp: new Date().toISOString(),
    sessionId: state.get('sessionId', 'unknown'),
    data,
  };
  _queue.push(event);
  if (_queue.length >= BATCH_SIZE) flushQueue();
  else scheduleFlush();
}

// Convenience emitters
const events = {
  trendScanned:    (trends)  => emit('trend.scanned',   { count: trends.length, topTrends: trends.slice(0,3).map(t=>t.title) }),
  contentGenerated:(post)    => emit('content.generated', { title: post.title, type: post.contentType, niche: post.niche }),
  postPublished:   (result)  => emit('content.published', { title: result.title, platforms: result.platforms?.map(p=>p.platform), count: result.published }),
  revenueEvent:    (event)   => emit('revenue.event', event),
  errorOccurred:   (agent, err) => emit('system.error', { agent, error: err.message }),
  healthCheck:     (score)   => emit('system.health', { score }),
  cycleComplete:   (summary) => emit('cycle.complete', summary),
  selfImproved:    (report)  => emit('system.improved', { healthScore: report?.healthScore, summary: report?.summary }),
};

// Flush on shutdown
process.on('SIGTERM', async () => { await flushQueue(); });
process.on('SIGINT',  async () => { await flushQueue(); });

module.exports = { emit, events, flushQueue };
