#!/usr/bin/env node
'use strict';

// Minimal static file server for previewing dist/ locally. No dependencies.
//   node scripts/serve.js   ->  http://localhost:5173

const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    let file = path.join(DIST, urlPath);
    // prevent path traversal
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        const notFound = path.join(DIST, '404.html');
        if (fs.existsSync(notFound)) {
          res.writeHead(404, { 'Content-Type': MIME['.html'] });
          fs.createReadStream(notFound).pipe(res);
        } else {
          res.writeHead(404).end('Not found');
        }
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(PORT, () => {
    console.log(`Serving dist/ at http://localhost:${PORT}`);
  });
