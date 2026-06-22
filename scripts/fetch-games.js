#!/usr/bin/env node
'use strict';

// Pulls game feeds defined in config.js (GameMonetize / GameDistribution), normalizes the
// different field shapes into one schema, merges + dedupes, and writes data/games.json.
//
//   node scripts/fetch-games.js
//
// Requires Node >= 18 (uses global fetch). No external dependencies.

const fs = require('fs');
const path = require('path');
const config = require('../config');

const OUT = path.join(__dirname, '..', 'data', 'games.json');

// --- tolerant field access (feeds disagree on casing / names) --------------
function pick(obj, ...keys) {
  if (!obj) return undefined;
  const lower = {};
  for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function asTags(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean);
  return String(v)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function asCategory(v) {
  if (Array.isArray(v)) return String(v[0] || 'Other').trim();
  return String(v || 'Other').trim();
}

// feed text often contains HTML tags + (sometimes double-) encoded entities.
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—',
  ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…',
  copy: '©', reg: '®', trade: '™', deg: '°', eacute: 'é',
};
function decodeOnce(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (NAMED[n.toLowerCase()] !== undefined ? NAMED[n.toLowerCase()] : m));
}
function clean(v) {
  if (!v) return '';
  let s = decodeOnce(decodeOnce(String(v))); // resolve (double-)encoded entities, incl. encoded tags
  s = s.replace(/<[^>]+>/g, ' '); // now strip any real tags
  s = decodeOnce(s); // final pass for stragglers
  return s.replace(/\s+/g, ' ').trim();
}

// --- per-source normalizers ------------------------------------------------
function normGameMonetize(item) {
  return {
    title: clean(pick(item, 'title', 'name')),
    description: clean(pick(item, 'description', 'desc')),
    instructions: clean(pick(item, 'instructions')),
    category: asCategory(pick(item, 'category')),
    tags: asTags(pick(item, 'tags')),
    thumb: pick(item, 'thumb', 'image', 'thumbnail', 'banner_image') || '',
    width: parseInt(pick(item, 'width') || '800', 10),
    height: parseInt(pick(item, 'height') || '600', 10),
    url: pick(item, 'url', 'game_url', 'link') || '',
    source: 'gamemonetize',
  };
}

function normGameDistribution(item) {
  // GD JSON uses fields like Title/Description/Url/Asset[]/Category[]/Tag[]
  const asset = pick(item, 'asset', 'assets');
  const thumb = Array.isArray(asset) ? asset[asset.length - 1] : asset;
  return {
    title: clean(pick(item, 'title', 'name')),
    description: clean(pick(item, 'description')),
    instructions: clean(pick(item, 'instructions')),
    category: asCategory(pick(item, 'category', 'categories')),
    tags: asTags(pick(item, 'tag', 'tags')),
    thumb: thumb || pick(item, 'thumb', 'image') || '',
    width: parseInt(pick(item, 'width') || '800', 10),
    height: parseInt(pick(item, 'height') || '600', 10),
    url: pick(item, 'url', 'embedurl', 'link') || '',
    source: 'gamedistribution',
  };
}

const NORMALIZERS = {
  gamemonetize: normGameMonetize,
  gamedistribution: normGameDistribution,
};

// --- feed parsing (JSON or RSS/XML) ----------------------------------------
function parseFeed(raw) {
  const text = raw.trim();
  if (text.startsWith('[') || text.startsWith('{')) {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    // common wrappers: {games:[...]}, {data:[...]}, {items:[...]}, {rss:{channel:{item:[]}}}
    return data.games || data.data || data.items || data.results || [];
  }
  // very light RSS fallback: extract <item>...</item> blocks and their fields
  const items = [];
  const itemRe = /<item[\s\S]*?<\/item>/gi;
  const fieldRe = (tag) =>
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const blocks = text.match(itemRe) || [];
  for (const b of blocks) {
    const obj = {};
    for (const tag of [
      'title',
      'description',
      'instructions',
      'category',
      'tags',
      'thumb',
      'image',
      'width',
      'height',
      'url',
      'link',
    ]) {
      const m = b.match(fieldRe(tag));
      if (m) obj[tag] = m[1].trim();
    }
    items.push(obj);
  }
  return items;
}

async function fetchSource(name, url) {
  if (!url) return [];
  process.stdout.write(`  • ${name}: fetching… `);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'gameweb-fetch/0.1' } });
    if (!res.ok) {
      console.log(`HTTP ${res.status} — skipped`);
      return [];
    }
    const raw = await res.text();
    const items = parseFeed(raw);
    const norm = NORMALIZERS[name] || normGameMonetize;
    const games = items.map(norm).filter((g) => g.title && g.url);
    console.log(`${games.length} games`);
    return games;
  } catch (err) {
    console.log(`error (${err.message}) — skipped`);
    return [];
  }
}

function dedupe(games) {
  const seen = new Set();
  const out = [];
  for (const g of games) {
    const key = String(g.title).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

async function main() {
  console.log('Fetching game feeds…');
  const all = [];
  for (const [name, url] of Object.entries(config.feeds || {})) {
    const games = await fetchSource(name, url);
    all.push(...games);
  }

  if (all.length === 0) {
    console.log(
      '\nNo games fetched. Likely causes:\n' +
        '  - The feed URLs in config.js are still placeholders → paste your real RSS-builder JSON URL.\n' +
        "  - You're offline, or the feed needs your publisher key.\n" +
        'Keeping the existing data/games.json (sample data) so the build still works.'
    );
    return;
  }

  let games = dedupe(all);
  if (config.maxGames && games.length > config.maxGames) {
    games = games.slice(0, config.maxGames);
  }

  fs.writeFileSync(OUT, JSON.stringify(games, null, 2));
  console.log(`\nWrote ${games.length} games -> data/games.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
