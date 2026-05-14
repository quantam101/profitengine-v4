'use strict';
/**
 * index.js - ProfitEngine v4.0 Entry Point
 * Already Here LLC | alreadyherellc.com
 * Auto-launches dashboard + scheduler on start.
 */
const config    = require('./config');
const logger    = require('./utils/logger');
const scheduler = require('./scheduler');
const dashboard = require('./dashboard/server');

async function main() {
  console.log(`
╔══════════════════════════════════════════╗
║   ProfitEngine v4.0 — Already Here LLC  ║
║   alreadyherellc.com                     ║
╚══════════════════════════════════════════╝
`);

  // Validate config (throws on missing required keys)
  try {
    config.validate();
  } catch (err) {
    logger.error('[BOOT] Config validation failed', { error: err.message });
    process.exit(1);
  }

  logger.info('[BOOT] Config loaded', config.redacted());

  // Ensure log + data dirs exist
  const fs = require('fs');
  ['logs', 'data'].forEach(d => fs.mkdirSync(d, { recursive: true }));

  // Start dashboard
  dashboard.start(config.port);

  // Start scheduler (runs first pipeline cycle immediately)
  await scheduler.start();

  logger.info(`[BOOT] ProfitEngine v4.0 fully operational`);
}

main().catch(err => {
  console.error('[BOOT] Fatal error:', err);
  process.exit(1);
});
