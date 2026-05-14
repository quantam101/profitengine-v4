'use strict';
/**
 * agents/websiteAgent.js — ProfitEngine v4.0
 * GitHub commit → Vercel auto-deploy pipeline.
 * Sitemap + RSS generation (Tier 0 — pure templates).
 * About/Privacy/Contact required pages published on startup.
 */
const axios  = require('axios');
const logger = require('../utils/logger');
const state  = require('../utils/state');
const config = require('../config');

function ghHeaders() {
  return {
    Authorization: `token ${config.githubToken}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function commitFile(filePath, content, message) {
  if (!config.githubToken) {
    logger.warn('[WebsiteAgent] No GITHUB_TOKEN — skipping commit');
    return null;
  }
  const apiBase = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${filePath}`;
  let sha;
  try {
    const existing = await axios.get(apiBase, { headers: ghHeaders(), timeout: 10000 });
    sha = existing.data.sha;
  } catch { /* file doesn't exist yet */ }

  const body = { message, content: Buffer.from(content).toString('base64') };
  if (sha) body.sha = sha;

  try {
    const res = await axios.put(apiBase, body, { headers: ghHeaders(), timeout: 15000 });
    logger.info(`[WebsiteAgent] Committed: ${filePath}`);
    return res.data;
  } catch (err) {
    logger.error(`[WebsiteAgent] Commit failed for ${filePath}`, { error: err.message });
    return null;
  }
}

async function publishPost(post) {
  if (!post?.title || !post?.body) return null;
  const slug = post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${config.githubBlogDir}/${date}-${slug}.md`;

  // Extract frontmatter or build it
  let content = post.body;
  if (!content.startsWith('---')) {
    content = `---\ntitle: "${post.title}"\ndate: "${date}"\ntags: [${(post.keywords || []).slice(0,5).map(k=>`"${k}"`).join(', ')}]\ndescription: "${(post.metaDescription || post.title).slice(0, 150)}"\n---\n\n${content}`;
  }

  const result = await commitFile(filename, content, `feat(content): ${post.title.slice(0, 60)}`);
  if (result) {
    state.push('publishedPosts', { slug, title: post.title, date, url: `https://${config.siteDomain}/${slug}` });
    state.increment('totalPostsPublished');
  }
  return result;
}

async function generateAndPublishSitemap() {
  const posts = state.get('publishedPosts', []);
  const pages = ['', 'about', 'privacy', 'contact', 'blog'];
  const urls = [
    ...pages.map(p => `  <url><loc>https://${config.siteDomain}/${p}</loc><changefreq>weekly</changefreq><priority>${p ? '0.8' : '1.0'}</priority></url>`),
    ...posts.slice(-100).map(p => `  <url><loc>https://${config.siteDomain}/${p.slug}</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  await commitFile('public/sitemap.xml', sitemap, 'chore(seo): update sitemap');
}

async function generateAndPublishRSSFeed() {
  const posts = state.get('publishedPosts', []).slice(-20);
  const items = posts.reverse().map(p => `
  <item>
    <title><![CDATA[${p.title}]]></title>
    <link>https://${config.siteDomain}/${p.slug}</link>
    <pubDate>${new Date(p.date).toUTCString()}</pubDate>
    <guid>https://${config.siteDomain}/${p.slug}</guid>
  </item>`).join('');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${config.businessName} Blog</title>
    <link>https://${config.siteDomain}</link>
    <description>Passive income, AI tools, and side hustle strategies</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;
  await commitFile('public/feed.xml', feed, 'chore(rss): update feed');
}

async function publishRequiredPages() {
  const PAGES = {
    'pages/about.md': `# About ${config.businessName}\n\n${config.businessName} helps people build passive income through AI-powered content, affiliate marketing, and print-on-demand.\n\nContact: ${config.contactEmail}`,
    'pages/contact.md': `# Contact\n\nEmail: [${config.contactEmail}](mailto:${config.contactEmail})\n\nSite: [${config.siteDomain}](https://${config.siteDomain})`,
    'pages/privacy.md': `# Privacy Policy\n\nThis site uses cookies for analytics. We participate in the Amazon Associates program. We do not sell your data.\n\nContact: ${config.contactEmail}`,
  };
  for (const [path, content] of Object.entries(PAGES)) {
    await commitFile(path, content, `chore(pages): publish ${path.split('/').pop()}`);
  }
  logger.info('[WebsiteAgent] Required pages published');
}

module.exports = { publishPost, generateAndPublishSitemap, generateAndPublishRSSFeed, publishRequiredPages, commitFile };
