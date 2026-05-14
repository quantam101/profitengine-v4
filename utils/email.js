'use strict';
/**
 * utils/email.js — ProfitEngine v4.0
 * Gmail SMTP via nodemailer. Retry on failure. Rate-limited.
 */
const nodemailer = require('nodemailer');
const logger     = require('./logger');

let _transport = null;
let _lastSent  = 0;
const MIN_INTERVAL_MS = 30_000; // max 2/min

function getTransport() {
  if (_transport) return _transport;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  _transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return _transport;
}

async function send({ to, subject, text, html }) {
  const transport = getTransport();
  if (!transport) {
    logger.warn('[EMAIL] Not configured — skipping send');
    return false;
  }
  // Rate limit
  const now = Date.now();
  if (now - _lastSent < MIN_INTERVAL_MS) {
    logger.debug('[EMAIL] Rate limited — queued send dropped');
    return false;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await transport.sendMail({
        from: `"ProfitEngine" <${process.env.GMAIL_USER}>`,
        to: to || process.env.ALERT_EMAIL,
        subject,
        text,
        html: html || `<pre>${text}</pre>`,
      });
      _lastSent = Date.now();
      logger.info(`[EMAIL] Sent: ${subject}`);
      return true;
    } catch (err) {
      logger.warn(`[EMAIL] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }
  return false;
}

module.exports = { send };
