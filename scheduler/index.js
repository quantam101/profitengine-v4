'use strict';
/**
 * scheduler/index.js - ProfitEngine v4.0
 * Adaptive cron-less scheduler. Interval driven by autoScale.
 * Full pipeline: scan -> generate -> seo -> affiliate -> publish -> social -> ultraflow.
 * Error recovery via dead-letter queue. Self-improvement every 24h.
 */
const logger          = require('../utils/logger');
const state           = require('../utils/state');
const config          = require('../config');
const autoScale       = require('../ultraflow/autoScale');
const ufBridge        = require('../ultraflow/bridge');
const trendScanner    = require('../agents/trendScanner');
const contentGen      = require('../agents/contentGenerator');
const seoAgent        = require('../agents/seoAgent');
const affiliateLinker = require('../agents/affiliateLinker');
const websiteAgent    = require('../agents/websiteAgent');
const publisher       = require('../publishers');
const selfImprove     = require('../agents/selfImprovementAgent');
const email           = require('../utils/email');

let _scanTimer      = null;
let _improveTimer   = null;
let _isRunning      = false;
let _cycleCount     = 0;

async function runPipeline() {
  if (_isRunning) {
    logger.warn('[SCHEDULER] Pipeline already running — skipping overlap');
    return;
  }
  _isRunning = true;
  _cycleCount++;
  const cycleStart = Date.now();
  logger.info(`[SCHEDULER] === Cycle #${_cycleCount} START ===`);

  const summary = { cycle: _cycleCount, trends: 0, generated: 0, published: 0, errors: [] };

  try {
    // 1. Scan trends
    const trends = await trendScanner.scanTrends().catch(err => {
      logger.error('[SCHEDULER] Trend scan failed', { error: err.message });
      summary.errors.push({ stage: 'trendScan', error: err.message });
      return [];
    });
    summary.trends = trends.length;
    ufBridge.events.trendScanned(trends);

    if (!trends.length) {
      logger.info('[SCHEDULER] No trends — skipping generation');
      _isRunning = false;
      return;
    }

    // 2. Generate content
    const contentPerRun = autoScale.getContentPerRun();
    const posts = await contentGen.generateBatch(trends.slice(0, contentPerRun)).catch(err => {
      summary.errors.push({ stage: 'contentGen', error: err.message });
      return [];
    });
    summary.generated = posts.length;

    // 3. SEO optimize + A/B title test + affiliate inject
    const enriched = [];
    for (const post of posts) {
      try {
        let p = await seoAgent.optimizePostSEO(post);
        p = await seoAgent.runABTitleTest(p);
        p = affiliateLinker.processPost(p);
        enriched.push(p);
        ufBridge.events.contentGenerated(p);
      } catch (err) {
        selfImprove.addToDeadLetter(post, err.message);
        summary.errors.push({ stage: 'enrich', error: err.message });
      }
    }

    // 4. Publish to website + all platforms
    for (const post of enriched) {
      try {
        await websiteAgent.publishPost(post);
        const result = await publisher.publish(post);
        summary.published += result.published;
        ufBridge.events.postPublished({ title: post.title, ...result });
      } catch (err) {
        selfImprove.addToDeadLetter(post, err.message);
        summary.errors.push({ stage: 'publish', error: err.message });
        state.push('publishErrors', { title: post.title, error: err.message, ts: new Date().toISOString() });
      }
    }

    // 5. Update sitemap + RSS every 5 cycles
    if (_cycleCount % 5 === 0) {
      await websiteAgent.generateAndPublishSitemap().catch(() => {});
      await websiteAgent.generateAndPublishRSSFeed().catch(() => {});
      await seoAgent.runSEOCycle().catch(() => {});
    }

  } catch (err) {
    logger.error('[SCHEDULER] Pipeline error', { error: err.message, stack: err.stack });
    ufBridge.events.errorOccurred('scheduler', err);
    summary.errors.push({ stage: 'pipeline', error: err.message });
  } finally {
    _isRunning = false;
    const duration = ((Date.now() - cycleStart) / 1000).toFixed(1);
    summary.durationSec = parseFloat(duration);
    logger.info(`[SCHEDULER] === Cycle #${_cycleCount} END — ${summary.generated} generated, ${summary.published} published (${duration}s) ===`);
    ufBridge.events.cycleComplete(summary);
    state.set('lastCycleSummary', { ...summary, ts: new Date().toISOString() });

    // Alert on repeated failures
    if (summary.errors.length > 2) {
      email.send({
        subject: `ProfitEngine Cycle #${_cycleCount} — ${summary.errors.length} errors`,
        text: `Errors:\n${summary.errors.map(e => `[${e.stage}] ${e.error}`).join('\n')}`,
      }).catch(() => {});
    }
  }
}

async function runSelfImprovement() {
  logger.info('[SCHEDULER] Running self-improvement cycle...');
  try {
    const report = await selfImprove.analyzeAndImprove();
    ufBridge.events.selfImproved(report);
    if (report?.healthScore < 40) {
      email.send({
        subject: `ProfitEngine Health Alert: ${report.healthScore}/100`,
        text: report.summary + '\n\nCritical issues:\n' + (report.criticalIssues || []).join('\n'),
      }).catch(() => {});
    }
  } catch (err) {
    logger.error('[SCHEDULER] Self-improvement failed', { error: err.message });
  }
}

function rescheduleScan() {
  if (_scanTimer) clearTimeout(_scanTimer);
  const interval = autoScale.getScanInterval();
  _scanTimer = setTimeout(async () => {
    await runPipeline();
    rescheduleScan(); // re-schedule after each run to pick up adaptive interval changes
  }, interval);
  logger.info(`[SCHEDULER] Next scan in ${Math.round(interval/60000)}m`);
}

async function start() {
  logger.info('[SCHEDULER] ProfitEngine v4.0 starting...');
  state.set('sessionId', `pe4_${Date.now()}`);
  state.set('startedAt', new Date().toISOString());

  // Required pages on startup (idempotent)
  await websiteAgent.publishRequiredPages().catch(err =>
    logger.warn('[SCHEDULER] Required pages failed', { error: err.message }));

  // Run first cycle immediately
  await runPipeline();
  rescheduleScan();

  // Self-improvement every 24h
  _improveTimer = setInterval(runSelfImprovement, 24 * 60 * 60 * 1000);
  // Run once after 1h on startup
  setTimeout(runSelfImprovement, 60 * 60 * 1000);

  logger.info(`[SCHEDULER] Running. Scan interval: ${autoScale.getScanInterval()/60000}m | Content/run: ${autoScale.getContentPerRun()}`);
}

function stop() {
  if (_scanTimer)    clearTimeout(_scanTimer);
  if (_improveTimer) clearInterval(_improveTimer);
  logger.info('[SCHEDULER] Stopped.');
}

module.exports = { start, stop, runPipeline, runSelfImprovement };
