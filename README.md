# gameweb — static HTML5 game portal

A zero-dependency static site generator for a game-aggregator portal that monetizes via
**GameMonetize** / **GameDistribution** feeds. Pull a feed → generate a full SEO-ready site
(home, category pages, game pages with embedded player, sitemap, ads.txt) → deploy anywhere.

Ships with **sample data** so it builds and previews out of the box.

> **Live example built from this template:** [BiteArcade](https://bitearcade.com) — 201 real GameMonetize games, daily auto-refresh, deployed on GitHub Pages + Cloudflare DNS.

## Quick start

```bash
npm run build      # generate dist/ from data/games.json (sample data works offline)
npm run dev        # preview at http://localhost:5173
```

Go live with real games (the default feed already pulls **real** GameMonetize games — no key needed):

1. Open `config.js`, set `siteName` and `siteUrl` (your real **root** domain). Optionally tune the
   feed params (`category` / `popularity` / `amount`).
2. `npm run fetch`   → pulls + merges the feeds into `data/games.json`
3. `npm run build`   → regenerates `dist/`
4. Deploy `dist/` to any static host — or let the included GitHub Actions do it daily (below).

`npm start` = build + serve.

## Deploy + daily auto-refresh (GitHub Actions)

`.github/workflows/deploy.yml` rebuilds with a **fresh game catalog every day** (and on every push)
and publishes to **GitHub Pages**. One-time setup:

1. Push this project to a GitHub repo (`main` branch).
2. Repo **Settings → Pages → Source = "GitHub Actions"**.
   - Or via CLI: `gh api repos/<owner>/<repo>/pages -X POST -f build_type=workflow`. **The push-triggered
     run fails the first time** (Pages wasn't enabled yet — `configure-pages` errors); just
     `gh run rerun <id>` after enabling Pages.
3. For a custom domain: set `siteUrl` in `config.js` (the build auto-writes `dist/CNAME`) and add the
   domain under Settings → Pages. Two gotchas that will waste your afternoon otherwise:
   - **DNS (Cloudflare):** four `A` records on `@` → `185.199.108–111.153`, plus `www` CNAME →
     `<owner>.github.io`. **Set every record to "DNS only" (grey cloud), NOT Proxied (orange)** —
     orange-cloud proxying breaks GitHub's cert issuance and causes redirect loops.
   - **HTTPS cert:** if you set the custom domain via the API, GitHub may not auto-trigger the
     Let's Encrypt cert (`https://...` shows a cert-mismatch). Fix: remove + re-add the domain to
     nudge it — `echo '{"cname":null}' | gh api repos/<owner>/<repo>/pages -X PUT --input -`, wait
     ~20s, then re-`PUT` `cname=<domain>`; poll `.https_certificate.state` until `issued`, then set
     `https_enforced=true`.

Prefer Cloudflare Pages? The workflow has a drop-in alternative job at the bottom.

If a feed is temporarily down during a CI run, the build falls back to the committed
`data/games.json`, so it never publishes an empty site — keep a known-good `data/games.json` committed.

## How it's wired

| File | Role |
|------|------|
| `config.js` | All knobs: branding, feed URLs, ads.txt, ad slots. **Edit this first.** |
| `scripts/fetch-games.js` | Pulls GameMonetize/GameDistribution JSON (or RSS) feeds → `data/games.json` |
| `scripts/build.js` | `data/games.json` + `config.js` → static site in `dist/` |
| `scripts/serve.js` | Tiny local preview server |
| `public/` | `styles.css`, `app.js` — copied verbatim into `dist/` |
| `data/games.json` | The game catalog (sample data until you run `fetch`) |

Generated per build: `index.html`, `games.html`, `category/*.html`, `game/*.html`,
generated SVG thumbnails, `ads.txt`, `robots.txt`, `sitemap.xml`, `site.webmanifest`,
`about/privacy/contact/404` pages.

## Getting the feed URLs

- **GameMonetize**: https://gamemonetize.com/rss-builder → choose **JSON** output → copy the URL into `config.feeds.gamemonetize`.
- **GameDistribution**: https://acc.gamedistribution.com/rss-builder → JSON → `config.feeds.gamedistribution`.

The fetcher tolerates either platform's field names and merges + dedupes by title. Games are
embedded by `iframe` straight from the provider's CDN — **you don't host the games**, and the
in-game ads come through automatically once your site is approved.

## Monetization checklist (and the China reality)

1. **Buy a real root domain** (`.com`). Subdomains (blogspot/wordpress/`*.vercel.app` as primary) are **rejected**.
2. Register as a **publisher** on GameMonetize (+ GameDistribution), add your site.
3. Paste the exact **ads.txt** lines from your dashboard into `config.adsTxt`, rebuild. The file must be live at `https://yourdomain/ads.txt`.
4. Approval bar is low (no traffic minimum) — the gate is ads.txt + clean domain history, not size.
5. After approval, set `ads.enabled = true` and paste any display-ad snippet into `config.ads.adSnippet`.

**Revenue is a function of traffic.** Publisher share ≈ **45%**, eCPM ≈ **$1.5–3 / 1000 ad
impressions**, min payout **$30** (Net-30). A brand-new low-traffic site earns cents/day — so
**put ~all effort into SEO/traffic, not the monetization wiring** (which this repo already handles).

**⚠️ Cashing out to mainland China is the real bottleneck.** GameMonetize pays **only** via
PayPal or USDT-ERC20:

- **PayPal CN**: ~$35 flat fee per withdrawal + 2.5–4% FX; personal accounts receiving foreign
  commercial payments is a compliance grey area (reported to PBOC/SAFE; $50k/yr forex cap).
- **USDT-ERC20**: ERC20 gas $5–30/tx (uneconomical at the $30 floor; **no TRC20 support**), and
  converting USDT↔RMB inside China is officially treated as **illegal forex trading**.

Least-bad path: receive **USDT into an overseas exchange** and settle off-China, or run a clean
**overseas/HK entity PayPal**. Sort this out *before* you hit the $30 threshold.

## Notes

- Pure Node ≥ 18, no `npm install` needed.
- `dist/` is gitignored — it's a build artifact.
- Links use root-absolute paths (`/game/x.html`), so preview via `npm run dev`, not by double-clicking files.
