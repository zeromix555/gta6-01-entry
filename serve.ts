// SOLMAR HEAT — a tiny static server for game/ (Node 22, stdlib only).
//
//   node serve.ts [--port 8080]
//
// Serves game/ on http://localhost:8080 (127.0.0.1 only). It sends the MIME
// types a browser game needs, answers / with game/index.html, refuses any
// path that escapes game/ with a 403, and 404s anything that is not there.
// This is a development convenience, not a web server for the internet.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    // / maps to the game itself; anything else maps under game/.
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = resolve(root, normalize(rel));
    if (file !== root && !file.startsWith(root + sep)) {
      log(req, url, 403);
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('403: outside game/\n');
      return;
    }
    const stat = statSync(file, { throwIfNoEntry: false });
    if (!stat || !stat.isFile()) {
      log(req, url, 404);
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404: not found\n');
      return;
    }
    log(req, url, 200);
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('500: server error\n');
  }
});

/** One log line per request: method, path and the status that went back. */
function log(req, url, status) {
  console.log(`${req.method} ${url.pathname} -> ${status}`);
}

server.listen(port, '127.0.0.1', () => {
  console.log(`SOLMAR HEAT serving game/ on http://127.0.0.1:${port}`);
});
