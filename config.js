// ---------------------------------------------------------------------------
// Site configuration. Edit this file, then run `npm run fetch && npm run build`.
// ---------------------------------------------------------------------------

module.exports = {
  // --- Branding -------------------------------------------------------------
  siteName: 'BiteArcade',
  siteTagline: 'Free Online Games — Play Instantly, No Download',
  // IMPORTANT: set this to your real domain (root domain, no trailing slash).
  // GameMonetize/GameDistribution will NOT approve subdomains (no *.blogspot, *.vercel.app as the
  // *primary* monetized domain). Buy a .com and point it at your static host.
  siteUrl: 'https://bitearcade.com',
  description:
    'Play hundreds of free HTML5 games online — puzzle, action, racing, arcade and more. ' +
    'No download, no signup. Works on mobile and desktop.',
  locale: 'en',
  themeColor: '#7c5cff',

  // --- Game feeds -----------------------------------------------------------
  // Paste the feed URL(s) you generate in each platform's RSS/Feed builder.
  //   GameMonetize : https://gamemonetize.com/rss-builder   (choose JSON output)
  //   GameDistribution: https://acc.gamedistribution.com/rss-builder (choose JSON output)
  // Set a source to null to disable it. `npm run fetch` pulls + merges all enabled feeds.
  feeds: {
    // GameMonetize public JSON feed (verified working, no key needed). Tune the params:
    //   category=All | Action | Puzzle | Racing | .IO | "2 Player" | 3D | Sports | Shooting ...
    //   popularity=newest | mostplayed | bestgames | hotgames
    //   amount=10|20|30|40|100|All   (how many games to pull)
    // Generate your own variant at https://gamemonetize.com/rss-builder (choose JSON).
    gamemonetize:
      'https://rss.gamemonetize.com/rssfeed.php?format=json&category=All&type=html5&popularity=mostplayed&company=All&amount=200',
    gamedistribution: null, // e.g. 'https://api.gamedistribution.com/...&format=json'
  },
  // Cap total games included in the build (keeps pages fast). 0 = no cap.
  maxGames: 400,

  // --- Monetization ---------------------------------------------------------
  // The in-game ads come automatically through each game's iframe once your site is
  // approved — you do not need to add anything for those. The slots below are for
  // OPTIONAL display ads on the portal pages (GameMonetize display unit / AdSense H5).
  ads: {
    enabled: false, // flip to true after approval, then paste your snippet in `adSnippet`
    // Paste the display-ad <script>/<ins> code your dashboard gives you. Rendered into each ad slot.
    adSnippet: '',
  },

  // --- ads.txt --------------------------------------------------------------
  // REQUIRED for monetization. Replace the placeholder lines below with the EXACT
  // lines from your GameMonetize / GameDistribution / AdSense dashboard.
  adsTxt: [
    '# === ads.txt — REPLACE these lines with the ones from your dashboards ===',
    '# GameMonetize -> Account -> Websites -> (your site) shows the lines to paste here.',
    '# google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0',
  ].join('\n'),

  // --- Layout knobs ---------------------------------------------------------
  featuredCount: 12, // games shown in the homepage "Featured" rail
  relatedCount: 8, // related games on a game page
  gamesPerCategoryPreview: 12, // cards per category section on the homepage
};
