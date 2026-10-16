// Test d'intégration du Worker avec une base SQLite en mémoire simulant D1 (node:sqlite).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_v2.sql']) db.exec(fs.readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    _run: () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { db, env: { SITE_NAME: 'Test', ASSETS: { fetch: async () => new Response('x') },
    DB: { prepare: (s) => stmt(s), batch: async (list) => list.map((s) => s._run()) } } };
}
const call = async (env, path, { method = 'GET', body, cookie, raw } = {}) => {
  const headers = { 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' };
  if (cookie) headers.cookie = cookie;
  const res = await worker.fetch(new Request('https://t.test' + path, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }), env);
  return { status: res.status, json: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};
const reg = (env, n) => call(env, '/api/register', { method: 'POST', body: { email: `u${n}@ex.com`, name: 'U', password: 'motdepasse1' } });

test('5 analyses gratuites puis blocage 402 côté serveur', async () => {
  const { env } = makeEnv(); const r = await reg(env, 1); assert.equal(r.status, 201);
  for (let i = 0; i < 5; i++) {
    const a = await call(env, '/api/analyze', { method: 'POST', cookie: r.cookie, body: { home: 'Atlas FC', away: 'Fjord City' } });
    assert.equal(a.status, 200); assert.equal(a.json.user.free_left, 4 - i);
  }
  const blocked = await call(env, '/api/analyze', { method: 'POST', cookie: r.cookie, body: { home: 'Atlas FC', away: 'Fjord City' } });
  assert.equal(blocked.status, 402); assert.equal(blocked.json.code, 'PAYWALL');
  assert.equal((await call(env, '/api/history', { cookie: r.cookie })).json.items.length, 5);
});
test('Analyse refusée sans connexion ; client ne peut pas se donner le premium', async () => {
  const { env } = makeEnv();
  assert.equal((await call(env, '/api/analyze', { method: 'POST', body: { home: 'Atlas FC', away: 'Fjord City' } })).status, 401);
  const r = await reg(env, 2);
  const hack = await call(env, '/api/admin/settings', { method: 'POST', cookie: r.cookie, body: { settings: { price_usd: '0' } } });
  assert.equal(hack.status, 403);
  assert.equal((await call(env, '/api/admin/payments/1/approve', { method: 'POST', cookie: r.cookie, body: {} })).status, 403);
});
test('Paiement : demande en attente, validation admin → premium, référence unique', async () => {
  const { env, db } = makeEnv();
  const u = await reg(env, 3), adm = await reg(env, 4);
  db.exec("UPDATE users SET role='admin' WHERE email='u4@ex.com'");
  const p = await call(env, '/api/pay/request', { method: 'POST', cookie: u.cookie, body: { method: 'orange', reference: 'OM12345' } });
  assert.equal(p.status, 201);
  assert.equal((await call(env, '/api/pay/request', { method: 'POST', cookie: adm.cookie, body: { method: 'orange', reference: 'OM12345' } })).status, 409);
  assert.equal((await call(env, '/api/pay/request', { method: 'POST', cookie: u.cookie, body: { method: 'crypto', reference: 'abcdef' } })).status, 400); // crypto désactivée
  assert.equal((await call(env, '/api/me', { cookie: u.cookie })).json.user.premium, false); // déclaration seule ≠ premium
  assert.equal((await call(env, '/api/admin/payments/1/approve', { method: 'POST', cookie: adm.cookie, body: {} })).status, 200);
  assert.equal((await call(env, '/api/me', { cookie: u.cookie })).json.user.premium, true);
  db.exec('UPDATE users SET free_left=0');
  assert.equal((await call(env, '/api/analyze', { method: 'POST', cookie: u.cookie, body: { home: 'Atlas FC', away: 'Fjord City' } })).status, 200);
});
test('Limite de créations de comptes par IP', async () => {
  const { env } = makeEnv();
  for (let i = 0; i < 3; i++) assert.equal((await reg(env, 10 + i)).status, 201);
  assert.equal((await reg(env, 20)).status, 429);
});
test('Connexion : mauvais mot de passe refusé, bon accepté', async () => {
  const { env } = makeEnv(); await reg(env, 5);
  assert.equal((await call(env, '/api/login', { method: 'POST', body: { email: 'u5@ex.com', password: 'faux' } })).status, 401);
  assert.equal((await call(env, '/api/login', { method: 'POST', body: { email: 'u5@ex.com', password: 'motdepasse1' } })).status, 200);
});
test('Config : crypto absente tant que non configurée, Orange Money présent', async () => {
  const { env } = makeEnv(); const c = (await call(env, '/api/config')).json;
  assert.deepEqual(c.methods.map((m) => m.id), ['orange']); assert.equal(c.price_xof, '5850'); assert.equal(c.price_usd, '10');
});

test('Comparateur, joueurs et entraîneurs publics (démo marquée fictive)', async () => {
  const { env } = makeEnv();
  const c = await call(env, '/api/compare?a=Atlas%20FC&b=Fjord%20City'); assert.equal(c.status, 200); assert.equal(c.json.fictional, true);
  assert.equal((await call(env, '/api/compare?a=Atlas%20FC&b=Atlas%20FC')).status, 400);
  const p = await call(env, '/api/players'); assert.equal(p.json.fictional, true); assert.ok(p.json.items.length > 0);
  assert.equal((await call(env, '/api/coaches')).json.fictional, true);
});
test('Import : réservé admin, valide, ignore les doublons, joueurs/entraîneurs', async () => {
  const { env, db } = makeEnv(); const u = await reg(env, 30);
  const csv = 'date,competition,home,away,home_goals,away_goals\n2025-01-01,L,A,B,1,0';
  assert.equal((await call(env, '/api/admin/import', { method: 'POST', cookie: u.cookie, raw: csv })).status, 403);
  db.exec("UPDATE users SET role='admin'");
  assert.equal((await call(env, '/api/admin/import', { method: 'POST', cookie: u.cookie, raw: csv })).json.imported, 1);
  await call(env, '/api/admin/import', { method: 'POST', cookie: u.cookie, raw: csv });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM matches').get().c, 1);
  const pl = 'name,team,position,season,minutes,starts,sub_apps,goals,assists,shots\nX,A,Attaquant,2025,900,10,2,5,3,20';
  assert.equal((await call(env, '/api/admin/import?type=players&source=statsbomb', { method: 'POST', cookie: u.cookie, raw: pl })).status, 200);
  assert.equal((await call(env, '/api/players')).json.fictional, false);
  assert.equal((await call(env, '/api/admin/import', { method: 'POST', cookie: u.cookie, raw: 'a,b\n1,2' })).status, 400);
});
test('Récupération de compte : code admin à usage unique, expire, invalide les sessions', async () => {
  const { env, db } = makeEnv(); const u = await reg(env, 40); const adm = await reg(env, 41);
  db.exec("UPDATE users SET role='admin' WHERE email='u41@ex.com'");
  assert.equal((await call(env, '/api/admin/users/1/reset', { method: 'POST', cookie: u.cookie, body: {} })).status, 403);
  const { code } = (await call(env, '/api/admin/users/1/reset', { method: 'POST', cookie: adm.cookie, body: {} })).json;
  assert.equal(code.length, 10);
  assert.equal((await call(env, '/api/reset', { method: 'POST', body: { email: 'u40@ex.com', code: 'AAAAAAAAAA', password: 'nouveaumdp1' } })).status, 400);
  assert.equal((await call(env, '/api/reset', { method: 'POST', body: { email: 'u41@ex.com', code, password: 'nouveaumdp1' } })).status, 400); // code d'un autre compte
  assert.equal((await call(env, '/api/reset', { method: 'POST', body: { email: 'u40@ex.com', code, password: 'nouveaumdp1' } })).status, 200);
  assert.equal((await call(env, '/api/reset', { method: 'POST', body: { email: 'u40@ex.com', code, password: 'autremdp123' } })).status, 400); // usage unique
  assert.equal((await call(env, '/api/me', { cookie: u.cookie })).json.user, null); // ancienne session révoquée
  assert.equal((await call(env, '/api/login', { method: 'POST', body: { email: 'u40@ex.com', password: 'nouveaumdp1' } })).status, 200);
  const { code: c2 } = (await call(env, '/api/admin/users/1/reset', { method: 'POST', cookie: adm.cookie, body: {} })).json;
  db.exec('UPDATE password_resets SET expires_at=1');
  assert.equal((await call(env, '/api/reset', { method: 'POST', body: { email: 'u40@ex.com', code: c2, password: 'encoremdp123' } })).status, 400);
});
test('Changement de mot de passe connecté', async () => {
  const { env } = makeEnv(); const u = await reg(env, 50);
  assert.equal((await call(env, '/api/password', { method: 'POST', cookie: u.cookie, body: { old_password: 'faux', new_password: 'nouveaumdp1' } })).status, 401);
  assert.equal((await call(env, '/api/password', { method: 'POST', cookie: u.cookie, body: { old_password: 'motdepasse1', new_password: 'nouveaumdp1' } })).status, 200);
});
test('Non-régression : les migrations v1 puis v2 s\'appliquent, analyses par utilisateur isolées', async () => {
  const { env } = makeEnv(); const a = await reg(env, 60), b = await reg(env, 61);
  const r = await call(env, '/api/analyze', { method: 'POST', cookie: a.cookie, body: { home: 'Atlas FC', away: 'Fjord City' } });
  assert.equal(r.json.result.heat.length, 5);
  assert.equal((await call(env, '/api/history/' + r.json.id, { cookie: b.cookie })).status, 404);
});
