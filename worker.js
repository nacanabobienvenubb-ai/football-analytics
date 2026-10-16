import { analyze, compareTeams, MODEL_VERSION } from './models.js';
import demo from '../data/demo.js';
import demoPeople from '../data/demo_people.js';
import { parseCsv, parsePlayers, parseCoaches } from './csv.js';

const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', ...h } });
const err = (m, s = 400) => J({ error: m }, s);
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sha = async (s) => b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const now = () => Date.now();
const UNLIMITED = 9e15;

export async function hashPassword(pw, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

async function settings(env) {
  const { results } = await env.DB.prepare('SELECT key,value FROM settings').all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}
const isPremium = (u) => u.premium_until > now();
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, free_left: u.free_left, premium: isPremium(u), premium_until: u.premium_until >= UNLIMITED ? 'illimité' : u.premium_until || null });

async function getUser(req, env) {
  const m = /(?:^|;\s*)sid=([A-Za-z0-9_-]+)/.exec(req.headers.get('cookie') || '');
  if (!m) return null;
  return env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha(m[1]), now()).first();
}
async function newSession(env, userId) {
  const raw = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(raw), userId, now() + 30 * 864e5).run();
  return `sid=${raw}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 864e5 / 1000}`;
}

async function loadMatches(env) {
  const { results } = await env.DB.prepare('SELECT date,competition,home,away,hg,ag,source FROM matches').all();
  if (results.length >= 20) {
    const src = [...new Set(results.map((r) => r.source))].map((x) => (x === 'statsbomb' ? 'StatsBomb Open Data (attribution requise)' : 'Import CSV')).join(' + ');
    return { matches: results, fictional: false, source: src };
  }
  return { matches: demo.matches, fictional: true, source: demo.label };
}

async function body(req) { try { return await req.json(); } catch { return {}; } }
const clean = (s, max) => String(s ?? '').trim().slice(0, max);

async function handle(req, env, url) {
  const path = url.pathname, method = req.method;
  if (method !== 'GET' && !(req.headers.get('content-type') || '').includes('application/json') && !(req.headers.get('content-type') || '').includes('text/csv')) return err('Requête non valide.', 415);
  const S = await settings(env);

  if (path === '/api/config' && method === 'GET') {
    const methods = [];
    if (S.orange_enabled === '1') methods.push({ id: 'orange', label: 'Orange Money', number: S.orange_number, country: S.orange_country });
    if (S.crypto_enabled === '1' && S.crypto_address) methods.push({ id: 'crypto', label: 'Cryptomonnaie', address: S.crypto_address, network: S.crypto_network, coin: S.crypto_coin, amount: S.crypto_amount, instructions: S.crypto_instructions });
    return J({ site: env.SITE_NAME || 'PitchLab', free_analyses: +S.free_analyses, price_usd: S.price_usd, price_xof: S.price_xof, premium_days: +S.premium_days, methods, conversion_note: 'La conversion USD/FCFA est indicative.' });
  }

  if (path === '/api/register' && method === 'POST') {
    const b = await body(req);
    const email = clean(b.email, 120).toLowerCase(), name = clean(b.name, 60), pw = String(b.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || pw.length < 8 || pw.length > 128) return err('Email valide, nom et mot de passe de 8 caractères minimum requis.');
    const ip = await sha((req.headers.get('CF-Connecting-IP') || 'inconnu') + ':' + (env.SITE_NAME || ''));
    const recent = await env.DB.prepare('SELECT COUNT(*) c FROM signup_log WHERE ip_hash=? AND ts>?').bind(ip, now() - 864e5).first();
    if (recent.c >= 3) return err('Trop de créations de compte depuis cette connexion. Réessayez demain.', 429);
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) return err('Cette adresse email est déjà utilisée.', 409);
    const { hash, salt } = await hashPassword(pw);
    const r = await env.DB.prepare('INSERT INTO users(email,name,pw_hash,pw_salt,free_left,created_at) VALUES(?,?,?,?,?,?)').bind(email, name, hash, salt, +S.free_analyses, now()).run();
    await env.DB.prepare('INSERT INTO signup_log(ip_hash,ts) VALUES(?,?)').bind(ip, now()).run();
    const cookie = await newSession(env, r.meta.last_row_id);
    return J({ ok: true }, 201, { 'set-cookie': cookie });
  }

  if (path === '/api/login' && method === 'POST') {
    const b = await body(req);
    const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(clean(b.email, 120).toLowerCase()).first();
    const h = await hashPassword(String(b.password || ''), u ? u.pw_salt : b64(new Uint8Array(16)));
    if (!u || !safeEq(h.hash, u.pw_hash)) return err('Email ou mot de passe incorrect.', 401);
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND expires_at<?').bind(u.id, now()).run();
    return J({ ok: true }, 200, { 'set-cookie': await newSession(env, u.id) });
  }
  if (path === '/api/logout' && method === 'POST') {
    const m = /sid=([A-Za-z0-9_-]+)/.exec(req.headers.get('cookie') || '');
    if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(m[1])).run();
    return J({ ok: true }, 200, { 'set-cookie': 'sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' });
  }

  if (path === '/api/teams' && method === 'GET') {
    const d = await loadMatches(env);
    return J({ teams: [...new Set(d.matches.flatMap((m) => [m.home, m.away]))].sort(), fictional: d.fictional, source: d.source, matches: d.matches.length });
  }

  if (path === '/api/compare' && method === 'GET') {
    const d = await loadMatches(env);
    try { return J({ ...compareTeams(d.matches, clean(url.searchParams.get('a'), 80), clean(url.searchParams.get('b'), 80)), source: d.source, fictional: d.fictional }); } catch (e) { return err(e.message); }
  }
  if (path === '/api/players' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM players ORDER BY team,name LIMIT 2000').all();
    return results.length ? J({ items: results, fictional: false, source: [...new Set(results.map((r) => r.source))].join(' + ') }) : J({ items: demoPeople.players, fictional: true, source: demoPeople.label });
  }
  if (path === '/api/coaches' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM coaches ORDER BY team,start_date DESC LIMIT 1000').all();
    return results.length ? J({ items: results, fictional: false, source: [...new Set(results.map((r) => r.source))].join(' + ') }) : J({ items: demoPeople.coaches, fictional: true, source: demoPeople.label });
  }
  if (path === '/api/reset' && method === 'POST') {
    // Récupération de compte : code à usage unique remis par l'administrateur (aucun service d'email gratuit requis).
    const b = await body(req); const pw = String(b.password || '');
    const gen = 'Code invalide ou expiré.';
    if (pw.length < 8 || pw.length > 128) return err('Mot de passe de 8 caractères minimum.');
    const u = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(clean(b.email, 120).toLowerCase()).first();
    const th = await sha(clean(b.code, 40).toUpperCase());
    const r = u && await env.DB.prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND user_id=? AND expires_at>?').bind(th, u.id, now()).first();
    if (!r) return err(gen, 400);
    const { hash, salt } = await hashPassword(pw);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pw_hash=?,pw_salt=? WHERE id=?').bind(hash, salt, u.id),
      env.DB.prepare('DELETE FROM password_resets WHERE user_id=?').bind(u.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id),
    ]);
    return J({ ok: true });
  }

  const user = await getUser(req, env);
  if (path === '/api/me' && method === 'GET') return J({ user: user ? publicUser(user) : null });
  if (!user) return err('Connexion requise.', 401);

  if (path === '/api/password' && method === 'POST') {
    const b = await body(req); const np = String(b.new_password || '');
    const h = await hashPassword(String(b.old_password || ''), user.pw_salt);
    if (!safeEq(h.hash, user.pw_hash)) return err('Mot de passe actuel incorrect.', 401);
    if (np.length < 8 || np.length > 128) return err('Nouveau mot de passe : 8 caractères minimum.');
    const n = await hashPassword(np);
    await env.DB.prepare('UPDATE users SET pw_hash=?,pw_salt=? WHERE id=?').bind(n.hash, n.salt, user.id).run();
    return J({ ok: true });
  }
  if (path === '/api/analyze' && method === 'POST') {
    const b = await body(req); const d = await loadMatches(env);
    let result;
    try { result = analyze(d.matches, clean(b.home, 80), clean(b.away, 80)); } catch (e) { return err(e.message); }
    result.data.source = d.source; result.data.fictional = d.fictional;
    if (!isPremium(user)) {
      // Décompte atomique côté serveur : impossible à contourner depuis le navigateur.
      const r = await env.DB.prepare('UPDATE users SET free_left=free_left-1 WHERE id=? AND free_left>0').bind(user.id).run();
      if (!r.meta.changes) return J({ error: 'Vos analyses gratuites sont épuisées. Activez l\'accès premium pour continuer.', code: 'PAYWALL' }, 402);
    }
    const ins = await env.DB.prepare('INSERT INTO analyses(user_id,home,away,model_version,result,created_at) VALUES(?,?,?,?,?,?)').bind(user.id, result.home, result.away, MODEL_VERSION, JSON.stringify(result), now()).run();
    const fresh = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
    return J({ id: ins.meta.last_row_id, result, user: publicUser(fresh) });
  }
  if (path === '/api/history' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id,home,away,model_version,created_at FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 100').bind(user.id).all();
    return J({ items: results });
  }
  const hm = /^\/api\/history\/(\d+)$/.exec(path);
  if (hm && method === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM analyses WHERE id=? AND user_id=?').bind(+hm[1], user.id).first();
    return r ? J({ id: r.id, created_at: r.created_at, result: JSON.parse(r.result) }) : err('Analyse introuvable.', 404);
  }

  if (path === '/api/pay/request' && method === 'POST') {
    const b = await body(req); const method_ = clean(b.method, 10), ref = clean(b.reference, 64);
    const ok = (method_ === 'orange' && S.orange_enabled === '1') || (method_ === 'crypto' && S.crypto_enabled === '1' && S.crypto_address);
    if (!ok) return err('Moyen de paiement indisponible.');
    if (ref.length < 4) return err('Référence de transaction trop courte.');
    const pending = await env.DB.prepare("SELECT COUNT(*) c FROM payment_requests WHERE user_id=? AND status='pending'").bind(user.id).first();
    if (pending.c >= 3) return err('Vous avez déjà des demandes en attente de vérification.', 429);
    const amount = method_ === 'orange' ? S.price_xof : (S.crypto_amount || S.price_usd), cur = method_ === 'orange' ? 'FCFA' : 'USD';
    try { await env.DB.prepare('INSERT INTO payment_requests(user_id,method,reference,amount,currency,created_at) VALUES(?,?,?,?,?,?)').bind(user.id, method_, ref, amount, cur, now()).run(); }
    catch { return err('Cette référence a déjà été soumise.', 409); }
    return J({ ok: true, status: 'pending' }, 201);
  }
  if (path === '/api/pay/mine' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id,method,reference,amount,currency,status,created_at FROM payment_requests WHERE user_id=? ORDER BY id DESC LIMIT 20').bind(user.id).all();
    return J({ items: results });
  }

  // ---- Administration (rôle vérifié en base à chaque requête) ----
  if (path.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return err('Accès refusé.', 403);
    if (path === '/api/admin/users' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id,email,name,role,free_left,premium_until,created_at FROM users ORDER BY id DESC LIMIT 200').all();
      const c = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM analyses) a,(SELECT COUNT(*) FROM matches) m,(SELECT COUNT(*) FROM error_log) e').first();
      return J({ items: results, stats: c });
    }
    if (path === '/api/admin/payments' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT p.*,u.email FROM payment_requests p JOIN users u ON u.id=p.user_id ORDER BY (p.status=\'pending\') DESC,p.id DESC LIMIT 200').all();
      return J({ items: results });
    }
    const pm = /^\/api\/admin\/payments\/(\d+)\/(approve|reject)$/.exec(path);
    if (pm && method === 'POST') {
      const p = await env.DB.prepare('SELECT * FROM payment_requests WHERE id=?').bind(+pm[1]).first();
      if (!p || p.status !== 'pending') return err('Demande introuvable ou déjà traitée.', 404);
      if (pm[2] === 'approve') {
        const days = +S.premium_days; const u = await env.DB.prepare('SELECT premium_until FROM users WHERE id=?').bind(p.user_id).first();
        const until = days <= 0 ? UNLIMITED : Math.max(now(), u.premium_until) + days * 864e5;
        await env.DB.batch([
          env.DB.prepare("UPDATE payment_requests SET status='approved',decided_at=? WHERE id=? AND status='pending'").bind(now(), p.id),
          env.DB.prepare('UPDATE users SET premium_until=? WHERE id=?').bind(until, p.user_id),
        ]);
      } else await env.DB.prepare("UPDATE payment_requests SET status='rejected',decided_at=? WHERE id=?").bind(now(), p.id).run();
      return J({ ok: true });
    }
    if (path === '/api/admin/settings' && method === 'GET') return J({ settings: S });
    if (path === '/api/admin/settings' && method === 'POST') {
      const b = await body(req); const allowed = Object.keys(S);
      const stmts = Object.entries(b.settings || {}).filter(([k]) => allowed.includes(k)).map(([k, v]) => env.DB.prepare('UPDATE settings SET value=? WHERE key=?').bind(clean(v, 500), k));
      if (stmts.length) await env.DB.batch(stmts);
      return J({ ok: true });
    }
    const rm = /^\/api\/admin\/users\/(\d+)\/reset$/.exec(path);
    if (rm && method === 'POST') {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.getRandomValues(new Uint8Array(10)), (x) => alphabet[x % 32]).join('');
      await env.DB.batch([
        env.DB.prepare('DELETE FROM password_resets WHERE user_id=?').bind(+rm[1]),
        env.DB.prepare('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(code), +rm[1], now() + 36e5),
      ]);
      return J({ code, expires_in_minutes: 60 });
    }
    if (path === '/api/admin/import' && method === 'POST') {
      const type = url.searchParams.get('type') || 'matches';
      const source = url.searchParams.get('source') === 'statsbomb' ? 'statsbomb' : 'csv';
      let rows; try { rows = { matches: parseCsv, players: parsePlayers, coaches: parseCoaches }[type]?.(await req.text()); } catch (e) { return err(e.message); }
      if (!rows) return err('Type d\'import inconnu.');
      if (rows.length > 5000) return err('5000 lignes maximum par import.');
      const q = {
        matches: (r) => env.DB.prepare('INSERT OR IGNORE INTO matches(date,competition,home,away,hg,ag,source) VALUES(?,?,?,?,?,?,?)').bind(r.date, r.competition, r.home, r.away, r.hg, r.ag, source),
        players: (r) => env.DB.prepare('INSERT OR REPLACE INTO players(name,team,position,season,minutes,starts,sub_apps,goals,assists,shots,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(r.name, r.team, r.position, r.season, r.minutes, r.starts, r.sub_apps, r.goals, r.assists, r.shots, source),
        coaches: (r) => env.DB.prepare('INSERT OR REPLACE INTO coaches(name,team,start_date,end_date,matches,wins,draws,losses,style_note,source) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(r.name, r.team, r.start_date, r.end_date, r.matches, r.wins, r.draws, r.losses, r.style_note, source),
      }[type];
      for (let i = 0; i < rows.length; i += 50) await env.DB.batch(rows.slice(i, i + 50).map(q));
      return J({ ok: true, imported: rows.length, note: type === 'matches' ? 'Les doublons (même date et mêmes équipes) sont ignorés.' : '' });
    }
  }
  return err('Introuvable.', 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try { return await handle(req, env, url); }
    catch (e) {
      try { await env.DB.prepare('INSERT INTO error_log(ts,route,msg) VALUES(?,?,?)').bind(now(), url.pathname, String(e.message).slice(0, 300)).run(); } catch {}
      return err('Erreur interne. Réessayez plus tard.', 500);
    }
  },
};
