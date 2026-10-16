// Serveur local de test : exécute le vrai Worker avec une base SQLite en mémoire (simule D1). Usage : node tools/devserver.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

const db = new DatabaseSync(':memory:');
for (const f of fs.readdirSync('migrations').sort()) db.exec(fs.readFileSync('migrations/' + f, 'utf8'));
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args) }),
  _run: () => { db.prepare(sql).run(...args); },
});
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const env = { SITE_NAME: 'PitchLab', DB: { prepare: (s) => stmt(s), batch: async (l) => l.map((s) => s._run()) },
  ASSETS: { fetch: async (req) => { let p = new URL(req.url).pathname; if (p === '/') p = '/index.html'; const f = path.join('public', p);
    return fs.existsSync(f) ? new Response(fs.readFileSync(f), { headers: { 'content-type': types[path.extname(f)] || 'application/octet-stream' } }) : new Response('nf', { status: 404 }); } } };
export const _db = db;
http.createServer(async (rq, rs) => {
  const chunks = []; for await (const c of rq) chunks.push(c);
  const res = await worker.fetch(new Request('http://localhost:' + port + rq.url, { method: rq.method, headers: rq.headers, body: ['GET', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks) }), env);
  rs.writeHead(res.status, Object.fromEntries(res.headers)); rs.end(Buffer.from(await res.arrayBuffer()));
}).listen(port = Number(process.argv[2] || 8787));
var port;
