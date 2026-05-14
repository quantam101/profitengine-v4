# ProfitEngine v4.0
**Already Here LLC** | alreadyherellc.com

Autonomous content monetization engine. Scans trends, generates SEO content, 
injects affiliate links, publishes to 6+ platforms, self-optimizes via AI.

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in at minimum: GROQ_API_KEY + GITHUB_TOKEN
node index.js
```

Dashboard auto-launches at http://localhost:3000

## Architecture

```
Trends (Google + Reddit)
  └─> AI Scoring (Tier 2 LLM)
        └─> Content Generation (Tier 2)
              └─> SEO Optimization + A/B Title Test (Tier 1)
                    └─> Affiliate Link Injection (Tier 0)
                          └─> Multi-Platform Publish
                                └─> UltraFlow VHLL Telemetry
```

## Pipeline

| Stage | Agent | Tier |
|-------|-------|------|
| Trend scan | trendScanner | 0+2 |
| Content gen | contentGenerator | 2 |
| SEO + A/B | seoAgent | 1 |
| Affiliate links | affiliateLinker | 0 |
| Website publish | websiteAgent | 0 |
| Multi-platform | publishers/ | 0 |
| Self-improvement | selfImprovementAgent | 2 |

## Platforms

Blog: Dev.to, Hashnode, Medium  
Social: Reddit, Mastodon, Pinterest  
Website: GitHub → Vercel  

## LLM Fallback Chain

Groq (llama-3.3-70b) → OpenRouter → Gemini 1.5 Flash  
Fast tier: Groq (gemma2-9b) → OpenRouter → Gemini  
Circuit breaker per provider. Exponential backoff.

## v4.0 VHLL Upgrades

- Self-modifying prompt templates scored by engagement
- Multi-arm bandit platform selection (UCB1)
- Two-level distillation cache (RAM + disk)
- Circuit breaker + dead-letter queue per agent
- Adaptive scheduling driven by AI health reports
- Claude API embedded in dashboard (Lifelong Catch & Correct)
- Structured telemetry → UltraFlow VHLL
