/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * Local Development & Production Node.js Server
 * Mirrors Vercel Serverless Function behavior and serves static frontend.
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Handlers
const prayersHandler = require('./api/prayers');
const adminLoginHandler = require('./api/admin/login');
const adminLogoutHandler = require('./api/admin/logout');
const adminDataHandler = require('./api/admin/data');
const adminOverrideHandler = require('./api/admin/override');
const adminResetHandler = require('./api/admin/reset');
const adminEntryHandler = require('./api/admin/entry/[id]');

const PORT = process.env.PORT || 8000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.ico':  'image/x-icon'
};

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

function adaptVercelRes(res) {
  res.status = function(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function(obj) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  adaptVercelRes(res);

  // Attach query & parsed body
  req.query = parsedUrl.query;
  req.body = await parseBody(req);

  // ── API Routes ──────────────────────────────────────────────────────────────
  if (pathname === '/api/prayers') {
    return prayersHandler(req, res);
  }
  if (pathname === '/api/admin/login') {
    return adminLoginHandler(req, res);
  }
  if (pathname === '/api/admin/logout') {
    return adminLogoutHandler(req, res);
  }
  if (pathname === '/api/admin/data') {
    return adminDataHandler(req, res);
  }
  if (pathname === '/api/admin/override') {
    return adminOverrideHandler(req, res);
  }
  if (pathname === '/api/admin/reset') {
    return adminResetHandler(req, res);
  }
  if (pathname.startsWith('/api/admin/entry')) {
    return adminEntryHandler(req, res);
  }

  // ── Static Files ───────────────────────────────────────────────────────────
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.status(403).end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.status(404).end('404 Not Found');
      } else {
        res.status(500).end('Internal Server Error');
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('='.repeat(56));
  console.log('  അമ്മയോടൊപ്പം | CLC Velappaya');
  console.log(`  Devotional Campaign Server running at http://localhost:${PORT}/`);
  console.log(`  Admin Panel at http://localhost:${PORT}/admin.html`);
  console.log('='.repeat(56));
});

module.exports = server;
