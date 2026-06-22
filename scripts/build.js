#!/usr/bin/env node
'use strict';

// Static site generator. Reads data/games.json + config.js and writes a complete,
// deployable game portal into dist/.  No external dependencies.
//
//   node scripts/build.js

const fs = require('fs');
const path = require('path');
const config = require('../config');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data', 'games.json');

const SITE = config.siteUrl.replace(/\/$/, '');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'game';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

function hashInt(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function write(rel, content) {
  const full = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// generated placeholder thumbnail (used when a game has no image / image 404s)
function thumbSvg(game) {
  const h = hashInt(game.title);
  const hue = h % 360;
  const hue2 = (hue + 40 + ((h >> 8) % 60)) % 360;
  const initials = game.title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 384" width="512" height="384" role="img" aria-label="${esc(game.title)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 22%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 75% 40%)"/>
    </linearGradient>
  </defs>
  <rect width="512" height="384" fill="url(#g)"/>
  <circle cx="256" cy="168" r="64" fill="rgba(255,255,255,.10)"/>
  <path d="M238 138 l46 30 -46 30 z" fill="rgba(255,255,255,.85)"/>
  <text x="256" y="320" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700"
        fill="rgba(255,255,255,.92)" text-anchor="middle">${esc(truncate(game.title, 22))}</text>
  <text x="20" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="800"
        fill="rgba(255,255,255,.35)">${esc(initials)}</text>
</svg>`;
}

function adSlot(label) {
  if (!config.ads || !config.ads.enabled) {
    return `<!-- ad slot: ${label} (disabled — set ads.enabled=true and ads.adSnippet in config.js) -->`;
  }
  return `<div class="ad-slot" data-slot="${esc(label)}">${config.ads.adSnippet || ''}</div>`;
}

const LOGO = `<svg class="logo-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
  <rect x="2" y="7" width="28" height="18" rx="6" fill="var(--accent)"/>
  <circle cx="11" cy="16" r="2.4" fill="#fff"/><circle cx="15" cy="16" r="2.4" fill="#fff"/>
  <rect x="20.5" y="14.6" width="5" height="2.8" rx="1.4" fill="#fff"/>
  <rect x="22.6" y="12.5" width="2.8" height="5" rx="1.4" fill="#fff"/>
</svg>`;

// schema.org BreadcrumbList from [{name, url}, ...] (drives breadcrumb rich results)
function breadcrumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: it.url,
    })),
  };
}

// Two concise, game-specific FAQ entries. Returns {visible, ld} so the rendered text
// and the FAQPage structured data are byte-identical (Google requires the match).
function faqFor(game) {
  const cat = String(game.category || 'arcade').toLowerCase();
  const qa = [
    {
      q: `Is ${game.title} free to play?`,
      a: `Yes. ${game.title} is completely free to play online at ${config.siteName} — no download, no installation and no sign-up.`,
    },
    {
      q: `Can I play ${game.title} on mobile?`,
      a: `Yes. ${game.title} is an HTML5 ${cat} game that runs right in the browser, so it works on phones, tablets and desktop.`,
    },
  ];
  const visible = `<div class="faq">${qa
    .map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`)
    .join('')}</div>`;
  const ld = {
    '@type': 'FAQPage',
    mainEntity: qa.map((x) => ({
      '@type': 'Question', name: x.q,
      acceptedAnswer: { '@type': 'Answer', text: x.a },
    })),
  };
  return { visible, ld };
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------
function layout({ title, description, canonical, body, jsonLd, ogImage }) {
  const fullTitle = title ? `${title} · ${config.siteName}` : `${config.siteName} — ${config.siteTagline}`;
  const desc = truncate(description || config.description, 160);
  const url = SITE + canonical;
  const img = ogImage || `${SITE}/icon.svg`;
  return `<!doctype html>
<html lang="${config.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="${config.themeColor}">
${config.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">` : '<!-- google-site-verification: set config.googleSiteVerification to enable -->'}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://html5.gamemonetize.com">
<link rel="preconnect" href="https://img.gamemonetize.com">
<link rel="stylesheet" href="/styles.css">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(Array.isArray(jsonLd) ? { '@context': 'https://schema.org', '@graph': jsonLd } : jsonLd)}</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/">${LOGO}<span>${esc(config.siteName)}</span></a>
    <form class="search" action="/games.html" method="get" role="search">
      <input type="search" name="q" placeholder="Search games…" aria-label="Search games" autocomplete="off">
    </form>
    <nav class="nav">
      <a href="/games.html">All Games</a>
      <a href="/#categories">Categories</a>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div>
      <a class="brand" href="/">${LOGO}<span>${esc(config.siteName)}</span></a>
      <p class="muted">${esc(config.description)}</p>
    </div>
    <nav class="foot-links">
      <a href="/games.html">All Games</a>
      <a href="/about.html">About</a>
      <a href="/privacy.html">Privacy</a>
      <a href="/contact.html">Contact</a>
    </nav>
  </div>
  <div class="wrap copyright muted">© ${esc(config.siteName)}. Games provided by their respective developers via GameMonetize / GameDistribution.</div>
</footer>
<script src="/app.js" defer></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// components
// ---------------------------------------------------------------------------
function card(game) {
  const src = game.thumb && /^https?:/.test(game.thumb) ? game.thumb : `/thumbs/${game.slug}.svg`;
  const fallback = `/thumbs/${game.slug}.svg`;
  return `<a class="card" href="/game/${game.slug}.html" data-search="${esc((game.title + ' ' + game.category + ' ' + game.tags.join(' ')).toLowerCase())}">
  <div class="card-thumb">
    <img src="${esc(src)}" alt="${esc(game.title)}" loading="lazy" width="512" height="384"
         onerror="this.onerror=null;this.src='${fallback}'">
    <span class="card-cat">${esc(game.category)}</span>
    <span class="card-play">▶ Play</span>
  </div>
  <h3 class="card-title">${esc(game.title)}</h3>
</a>`;
}

function grid(games) {
  return `<div class="grid">${games.map(card).join('\n')}</div>`;
}

function section(titleHtml, games, moreHref) {
  if (!games.length) return '';
  return `<section class="rail">
  <div class="rail-head"><h2>${titleHtml}</h2>${moreHref ? `<a class="more" href="${moreHref}">See all →</a>` : ''}</div>
  ${grid(games)}
</section>`;
}

// player area for a game page
function player(game) {
  if (!game.url || game.source === 'demo') {
    return `<div class="player player-demo">
      <div class="player-demo-inner">
        <div class="player-demo-badge">DEMO</div>
        <h3>Connect your game feed to play</h3>
        <p>This is sample data. Put your GameMonetize / GameDistribution feed URL in
        <code>config.js</code>, then run <code>npm run fetch &amp;&amp; npm run build</code> —
        real, playable games will load right here.</p>
      </div>
    </div>`;
  }
  const ratio = Math.min(1.6, Math.max(0.5, (game.height || 600) / (game.width || 800)));
  return `<div class="player" style="--ratio:${(ratio * 100).toFixed(2)}%">
    <iframe class="player-frame" src="${esc(game.url)}" title="${esc(game.title)}"
      loading="lazy" allow="autoplay; fullscreen; gamepad; cross-origin-isolated"
      allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock allow-orientation-lock"></iframe>
  </div>
  <div class="player-bar">
    <button type="button" class="btn" id="fs-btn">⛶ Fullscreen</button>
    <span class="muted">${game.width}×${game.height}</span>
  </div>`;
}

// ---------------------------------------------------------------------------
// pages
// ---------------------------------------------------------------------------
function homePage(games, categories) {
  const featured = games.slice(0, config.featuredCount);
  const hero = `<section class="hero">
    <div class="wrap">
      <h1>${esc(config.siteName)} <span class="muted">— ${esc(config.siteTagline)}</span></h1>
      <p class="lede">${esc(config.description)}</p>
    </div>
  </section>`;
  const catNav = `<section id="categories" class="wrap chips-wrap">
    <div class="chips">
      <a class="chip active" href="/games.html">All</a>
      ${categories.map((c) => `<a class="chip" href="/category/${c.slug}.html">${esc(c.name)} <span>${c.count}</span></a>`).join('')}
    </div>
  </section>`;
  const railFeatured = section('🔥 Featured', featured, '/games.html');
  const catSections = categories
    .map((c) =>
      section(
        `${esc(c.name)}`,
        c.games.slice(0, config.gamesPerCategoryPreview),
        `/category/${c.slug}.html`
      )
    )
    .join('\n');
  const body = `${hero}${catNav}<div class="wrap">${adSlot('home-top')}${railFeatured}${catSections}${adSlot('home-bottom')}</div>`;
  return layout({
    title: '',
    description: config.description,
    canonical: '/',
    body,
    jsonLd: [
      {
        '@type': 'WebSite',
        name: config.siteName,
        url: SITE + '/',
        potentialAction: {
          '@type': 'SearchAction',
          target: SITE + '/games.html?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        name: config.siteName,
        url: SITE + '/',
        logo: SITE + '/icon.svg',
      },
    ],
  });
}

function allGamesPage(games) {
  const body = `<section class="wrap page-head">
    <h1>All Games</h1>
    <p class="muted">${games.length} free games to play right now.</p>
    <div class="filter"><input type="search" id="filter-input" placeholder="Filter games…" aria-label="Filter games"></div>
  </section>
  <div class="wrap">${adSlot('games-top')}${grid(games)}<p id="no-results" class="muted no-results" hidden>No games match your search.</p></div>`;
  return layout({ title: 'All Games', description: `Browse all ${games.length} free online games.`, canonical: '/games.html', body });
}

function categoryPage(cat) {
  const body = `<section class="wrap page-head">
    <nav class="crumbs"><a href="/">Home</a> / <span>${esc(cat.name)}</span></nav>
    <h1>${esc(cat.name)} Games</h1>
    <p class="muted">${cat.count} free ${esc(cat.name.toLowerCase())} games to play online.</p>
  </section>
  <div class="wrap">${adSlot('cat-top')}${grid(cat.games)}</div>`;
  return layout({
    title: `${cat.name} Games`,
    description: `Play ${cat.count} free ${cat.name.toLowerCase()} games online — no download.`,
    canonical: `/category/${cat.slug}.html`,
    body,
    jsonLd: [
      {
        '@type': 'CollectionPage',
        name: `${cat.name} Games`,
        url: `${SITE}/category/${cat.slug}.html`,
        description: `Free ${cat.name.toLowerCase()} games to play online.`,
      },
      breadcrumbLd([
        { name: 'Home', url: SITE + '/' },
        { name: cat.name, url: `${SITE}/category/${cat.slug}.html` },
      ]),
      {
        '@type': 'ItemList',
        numberOfItems: cat.games.length,
        itemListElement: cat.games.map((g, i) => ({
          '@type': 'ListItem', position: i + 1, url: `${SITE}/game/${g.slug}.html`, name: g.title,
        })),
      },
    ],
  });
}

function gamePage(game, related) {
  const thumb = game.thumb && /^https?:/.test(game.thumb) ? game.thumb : `${SITE}/thumbs/${game.slug}.svg`;
  const faq = faqFor(game);
  const controls = truncate(game.instructions, 70) || 'Mouse / touch';
  const body = `<div class="wrap game-layout">
    <article class="game-main">
      <nav class="crumbs"><a href="/">Home</a> / <a href="/category/${game.categorySlug}.html">${esc(game.category)}</a> / <span>${esc(game.title)}</span></nav>
      <h1>${esc(game.title)}</h1>
      ${player(game)}
      ${adSlot('game-under-player')}
      <section class="game-info">
        <h2>About ${esc(game.title)}</h2>
        <p>${esc(game.description)}</p>
        <h2>How to play ${esc(game.title)}</h2>
        <p>${esc(game.instructions)}</p>
        <dl class="game-facts">
          <div><dt>Category</dt><dd><a href="/category/${game.categorySlug}.html">${esc(game.category)}</a></dd></div>
          <div><dt>Controls</dt><dd>${esc(controls)}</dd></div>
          <div><dt>Platform</dt><dd>Browser (HTML5) — desktop &amp; mobile</dd></div>
          <div><dt>Price</dt><dd>Free to play</dd></div>
        </dl>
        ${game.tags.length ? `<div class="tags">${game.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <h2>${esc(game.title)} — FAQ</h2>
        ${faq.visible}
      </section>
    </article>
    <aside class="game-aside">
      <h2>More ${esc(game.category)} games</h2>
      ${grid(related)}
      <a class="more" href="/category/${game.categorySlug}.html">See all ${esc(game.category)} games →</a>
    </aside>
  </div>`;
  return layout({
    title: game.title,
    description: game.description || `Play ${game.title} free online.`,
    canonical: `/game/${game.slug}.html`,
    ogImage: thumb,
    body,
    jsonLd: [
      {
        '@type': 'VideoGame',
        name: game.title,
        description: truncate(game.description, 300),
        url: `${SITE}/game/${game.slug}.html`,
        image: thumb,
        genre: game.category,
        keywords: game.tags.join(', '),
        inLanguage: config.locale,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Web browser (HTML5)',
        gamePlatform: ['Web Browser', 'Mobile'],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
        publisher: { '@type': 'Organization', name: config.siteName, url: SITE + '/' },
      },
      breadcrumbLd([
        { name: 'Home', url: SITE + '/' },
        { name: game.category, url: `${SITE}/category/${game.categorySlug}.html` },
        { name: game.title, url: `${SITE}/game/${game.slug}.html` },
      ]),
      faq.ld,
    ],
  });
}

function staticPage(title, slug, inner) {
  const body = `<div class="wrap prose"><nav class="crumbs"><a href="/">Home</a> / <span>${esc(title)}</span></nav><h1>${esc(title)}</h1>${inner}</div>`;
  return layout({ title, description: `${title} — ${config.siteName}`, canonical: `/${slug}.html`, body });
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(DATA)) {
    console.error('data/games.json not found. Run `npm run fetch` first (or keep the sample data).');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  let games = (Array.isArray(raw) ? raw : []).filter((g) => g && g.title);
  if (config.maxGames) games = games.slice(0, config.maxGames);

  // enrich + de-dupe slugs
  const used = new Set();
  for (const g of games) {
    g.tags = Array.isArray(g.tags) ? g.tags : [];
    g.category = g.category || 'Other';
    g.categorySlug = slugify(g.category);
    let s = slugify(g.title);
    let i = 2;
    while (used.has(s)) s = `${slugify(g.title)}-${i++}`;
    used.add(s);
    g.slug = s;
  }

  // categories
  const catMap = new Map();
  for (const g of games) {
    if (!catMap.has(g.category)) catMap.set(g.category, { name: g.category, slug: g.categorySlug, games: [] });
    catMap.get(g.category).games.push(g);
  }
  const categories = [...catMap.values()].map((c) => ({ ...c, count: c.games.length })).sort((a, b) => b.count - a.count);

  // reset dist
  rmrf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  // assets
  copyDir(PUBLIC, DIST);

  // generated thumbnails
  for (const g of games) write(`thumbs/${g.slug}.svg`, thumbSvg(g));

  // pages
  write('index.html', homePage(games, categories));
  write('games.html', allGamesPage(games));
  for (const c of categories) write(`category/${c.slug}.html`, categoryPage(c));
  for (const g of games) {
    const related = (catMap.get(g.category).games.filter((x) => x !== g).concat(games))
      .filter((x, idx, arr) => arr.indexOf(x) === idx && x !== g)
      .slice(0, config.relatedCount);
    write(`game/${g.slug}.html`, gamePage(g, related));
  }

  // legal / info pages (help with AdSense approval + trust)
  write('about.html', staticPage('About', 'about', `<p>${esc(config.siteName)} is a free online games portal. We curate hundreds of HTML5 games you can play instantly in your browser — no download, no signup — on desktop and mobile.</p><p>Games are provided by their respective developers and distributed through GameMonetize and GameDistribution.</p>`));
  write('privacy.html', staticPage('Privacy Policy', 'privacy', `<p>This site shows third-party games and may serve third-party advertisements. Ad and analytics partners may use cookies and similar technologies to measure and personalize ads in accordance with their own policies.</p><h2>Cookies</h2><p>We and our partners may store cookies to remember preferences and measure traffic. You can disable cookies in your browser settings.</p><h2>Third-party content</h2><p>Embedded games are hosted by their providers; their privacy practices apply while you play. </p><h2>Contact</h2><p>Questions about privacy? See our <a href="/contact.html">contact page</a>.</p>`));
  write('contact.html', staticPage('Contact', 'contact', `<p>For partnership, content removal (DMCA) or general questions, email <strong>hello@${esc((SITE.replace(/^https?:\/\//, '') || 'example.com'))}</strong>.</p>`));

  // 404
  write('404.html', layout({ title: 'Page not found', description: 'Page not found', canonical: '/404.html', body: `<div class="wrap prose" style="text-align:center;padding:80px 0"><h1>404</h1><p class="muted">That page wandered off. </p><p><a class="btn" href="/">← Back to games</a></p></div>` }));

  // ads.txt (REQUIRED for monetization)
  write('ads.txt', config.adsTxt + '\n');

  // robots.txt
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

  // sitemap.xml
  const urls = ['/', '/games.html', '/about.html', '/privacy.html', '/contact.html']
    .concat(categories.map((c) => `/category/${c.slug}.html`))
    .concat(games.map((g) => `/game/${g.slug}.html`));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}
</urlset>`;
  write('sitemap.xml', sitemap);

  // web manifest + svg icon
  write('site.webmanifest', JSON.stringify({
    name: config.siteName,
    short_name: config.siteName,
    start_url: '/',
    display: 'standalone',
    background_color: '#0e0e14',
    theme_color: config.themeColor,
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }, null, 2));
  write('icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${config.themeColor}"/><circle cx="11" cy="16" r="2.6" fill="#fff"/><circle cx="15.5" cy="16" r="2.6" fill="#fff"/><rect x="21" y="14.5" width="5" height="3" rx="1.5" fill="#fff"/><rect x="23" y="12.5" width="3" height="5" rx="1.5" fill="#fff"/></svg>`);

  // CNAME for GitHub Pages custom domains (only when a real domain is configured)
  const host = SITE.replace(/^https?:\/\//, '');
  if (host && host !== 'example.com') write('CNAME', host + '\n');

  // summary
  console.log(`Built ${games.length} games · ${categories.length} categories -> dist/`);
  if (games.some((g) => g.source === 'demo')) {
    console.log('NOTE: using sample/demo data. Set your feed URL in config.js and run `npm run fetch` for real games.');
  }
}

main();
