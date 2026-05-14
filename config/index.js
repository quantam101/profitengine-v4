'use strict';
/**
 * config/index.js — ProfitEngine v4.0
 * Already Here LLC · alreadyherellc.com
 * Boot-time validated config. Secrets masked in logs. Never serialized to state.
 */

const MASKED = '[REDACTED]';

function require_env(key, fallback = null) {
  const val = process.env[key];
  if (!val && fallback === null) {
    throw new Error(`[CONFIG] Required env var missing: ${key}`);
  }
  return val || fallback;
}

function optional_env(key, fallback = '') {
  return process.env[key] || fallback;
}

const config = {
  // Core
  port:            parseInt(optional_env('PORT', '3000'), 10),
  nodeEnv:         optional_env('NODE_ENV', 'production'),
  businessName:    optional_env('BUSINESS_NAME', 'Already Here LLC'),
  siteDomain:      optional_env('SITE_DOMAIN', 'alreadyherellc.com'),
  contactEmail:    optional_env('CONTACT_EMAIL', 'alreadyherellc@gmail.com'),
  logLevel:        optional_env('LOG_LEVEL', 'info'),

  // Content
  targetNiches:    optional_env('TARGET_NICHES', 'passive income,ai tools,side hustle,print on demand,affiliate marketing')
                     .split(',').map(s => s.trim()).filter(Boolean),
  affiliateProducts: optional_env('AFFILIATE_PRODUCTS', 'ring light,tripod,microphone,laptop stand,canva pro,web hosting')
                       .split(',').map(s => s.trim()).filter(Boolean),
  scanIntervalMinutes: parseInt(optional_env('SCAN_INTERVAL_MINUTES', '15'), 10),
  maxPostsPerDay:  parseInt(optional_env('MAX_POSTS_PER_DAY', '20'), 10),
  contentPerRun:   parseInt(optional_env('CONTENT_PER_RUN', '3'), 10),

  // LLM
  groqApiKey:        optional_env('GROQ_API_KEY'),
  openrouterApiKey:  optional_env('OPENROUTER_API_KEY'),
  geminiApiKey:      optional_env('GEMINI_API_KEY'),

  // GitHub
  githubToken:    optional_env('GITHUB_TOKEN'),
  githubOwner:    optional_env('GITHUB_OWNER', 'quantam101'),
  githubRepo:     optional_env('GITHUB_REPO', 'already-here-llc'),
  githubBlogDir:  optional_env('GITHUB_BLOG_DIR', 'posts'),

  // Platforms
  devtoApiKey:           optional_env('DEVTO_API_KEY'),
  hashnodeApiKey:        optional_env('HASHNODE_API_KEY'),
  hashnodePublicationId: optional_env('HASHNODE_PUBLICATION_ID'),
  mediumApiKey:          optional_env('MEDIUM_API_KEY'),
  mediumAuthorId:        optional_env('MEDIUM_AUTHOR_ID'),

  // Social
  mastodonAccessToken: optional_env('MASTODON_ACCESS_TOKEN'),
  mastodonInstance:    optional_env('MASTODON_INSTANCE', 'mastodon.social'),
  pinterestToken:      optional_env('PINTEREST_ACCESS_TOKEN'),
  pinterestBoardId:    optional_env('PINTEREST_BOARD_ID'),
  redditClientId:      optional_env('REDDIT_CLIENT_ID'),
  redditClientSecret:  optional_env('REDDIT_CLIENT_SECRET'),
  redditUsername:      optional_env('REDDIT_USERNAME'),
  redditPassword:      optional_env('REDDIT_PASSWORD'),
  twitterApiKey:       optional_env('TWITTER_API_KEY'),
  twitterApiSecret:    optional_env('TWITTER_API_SECRET'),
  twitterAccessToken:  optional_env('TWITTER_ACCESS_TOKEN'),
  twitterAccessSecret: optional_env('TWITTER_ACCESS_SECRET'),

  // Affiliate
  amazonTag:              optional_env('AMAZON_PARTNER_TAG', 'alreadyhere-20'),
  amazonPayoutThreshold:  parseFloat(optional_env('AMAZON_PAYOUT_THRESHOLD', '10')),

  // POD
  printifyApiKey:  optional_env('PRINTIFY_API_KEY'),
  printifyShopId:  optional_env('PRINTIFY_SHOP_ID'),

  // Email
  gmailUser:        optional_env('GMAIL_USER'),
  gmailAppPassword: optional_env('GMAIL_APP_PASSWORD'),
  alertEmail:       optional_env('ALERT_EMAIL', 'alreadyherellc@gmail.com'),
  mediumPayoutThreshold: parseFloat(optional_env('MEDIUM_PAYOUT_THRESHOLD', '10')),

  // Dashboard auth
  dashUser: optional_env('DASH_USER'),
  dashPass: optional_env('DASH_PASS'),

  // UltraFlow VHLL
  ultraflowUrl:    optional_env('ULTRAFLOW_URL'),
  ultraflowApiKey: optional_env('ULTRAFLOW_API_KEY'),
};

// Validate at least one LLM key is present
function validate() {
  if (!config.groqApiKey && !config.openrouterApiKey && !config.geminiApiKey) {
    throw new Error('[CONFIG] At least one LLM key required: GROQ_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY');
  }
  if (!config.githubToken) {
    throw new Error('[CONFIG] GITHUB_TOKEN is required for website publishing');
  }
  if (!config.gmailAppPassword || !config.alertEmail) {
    console.warn('[CONFIG] Email alerts disabled — set GMAIL_APP_PASSWORD + ALERT_EMAIL');
  }
}

// Safe log-friendly version — never logs secrets
function redacted() {
  return {
    ...config,
    groqApiKey:        config.groqApiKey        ? MASKED : '(not set)',
    openrouterApiKey:  config.openrouterApiKey  ? MASKED : '(not set)',
    geminiApiKey:      config.geminiApiKey       ? MASKED : '(not set)',
    githubToken:       config.githubToken        ? MASKED : '(not set)',
    devtoApiKey:       config.devtoApiKey        ? MASKED : '(not set)',
    hashnodeApiKey:    config.hashnodeApiKey     ? MASKED : '(not set)',
    mediumApiKey:      config.mediumApiKey       ? MASKED : '(not set)',
    mastodonAccessToken: config.mastodonAccessToken ? MASKED : '(not set)',
    pinterestToken:    config.pinterestToken     ? MASKED : '(not set)',
    redditClientSecret:config.redditClientSecret ? MASKED : '(not set)',
    twitterApiSecret:  config.twitterApiSecret   ? MASKED : '(not set)',
    gmailAppPassword:  config.gmailAppPassword   ? MASKED : '(not set)',
    ultraflowApiKey:   config.ultraflowApiKey    ? MASKED : '(not set)',
    printifyApiKey:    config.printifyApiKey     ? MASKED : '(not set)',
  };
}

config.validate = validate;
config.redacted  = redacted;

module.exports = config;
