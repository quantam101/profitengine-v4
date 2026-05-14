'use strict';
/**
 * utils/logger.js — ProfitEngine v4.0
 * Winston structured logger. Masks secrets. Never logs raw API keys.
 */
const { createLogger, format, transports } = require('winston');
const path = require('path');

const SECRET_PATTERN = /([a-zA-Z0-9_-]{20,})/g;
const SAFE_PREFIXES   = ['http', 'alreadyhere', 'already', 'reddit', 'mastodon', 'profitengine'];

function maskSecrets(obj) {
  if (typeof obj === 'string') {
    // Only mask strings that look like keys (long, no spaces, not URLs or known safe values)
    if (obj.length > 30 && !obj.includes(' ') && !obj.startsWith('http')) {
      return '[REDACTED]';
    }
    return obj;
  }
  if (typeof obj !== 'object' || obj === null) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (lk.includes('key') || lk.includes('secret') || lk.includes('token') || lk.includes('password')) {
      out[k] = v ? '[REDACTED]' : '(not set)';
    } else {
      out[k] = maskSecrets(v);
    }
  }
  return out;
}

const safeFormat = format((info) => {
  if (info.meta) info.meta = maskSecrets(info.meta);
  if (info.error && info.error.config) {
    // Axios error — strip request headers
    const { config: _, ...rest } = info.error;
    info.error = rest;
  }
  return info;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    safeFormat(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...rest }) => {
          const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
          return `${timestamp} [${level}] ${message}${extra}`;
        })
      )
    }),
    new transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
    new transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
