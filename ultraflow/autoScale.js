'use strict';
/**
 * ultraflow/autoScale.js - ProfitEngine v4.0
 * Reads adaptive settings written by selfImprovementAgent.
 * Provides runtime scan interval + content-per-run to scheduler.
 */
const state  = require('../utils/state');
const config = require('../config');

function getScanInterval() {
  // Adaptive override from self-improvement agent, fallback to config
  return (state.get('adaptiveScanInterval') || config.scanIntervalMinutes) * 60 * 1000;
}

function getContentPerRun() {
  return state.get('adaptiveContentPerRun') || config.contentPerRun;
}

function getPostingCap() {
  return config.maxPostsPerDay;
}

function status() {
  return {
    scanIntervalMs:  getScanInterval(),
    contentPerRun:   getContentPerRun(),
    postingCap:      getPostingCap(),
    adaptive:        !!state.get('adaptiveScanInterval'),
    lastImproved:    state.get('lastImprovementReport')?.generatedAt || null,
  };
}

module.exports = { getScanInterval, getContentPerRun, getPostingCap, status };
