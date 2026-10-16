// Modèles statistiques : Poisson, Elo, forme récente, combinaison pondérée.
export const MODEL_VERSION = '1.0.0';
const DAY = 86400000;
const fact = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
export const poisson = (k, l) => Math.exp(-l) * Math.pow(l, k) / fact(k);

export function scoreGrid(lh, la, max = 8) {
  const cells = []; let ph = 0, pd = 0, pa = 0, tot = 0;
  for (let i = 0; i <= max; i++) for (let j = 0; j <= max; j++) {
    const p = poisson(i, lh) * poisson(j, la);
    cells.push({ h: i, a: j, p }); tot += p;
    if (i > j) ph += p; else if (i === j) pd += p; else pa += p;
  }
  cells.forEach((c) => (c.p /= tot));
  return { cells, home: ph / tot, draw: pd / tot, away: pa / tot };
}

export function eloRatings(matches, { k = 20, hfa = 60, base = 1500 } = {}) {
  const r = {};
  const sorted = [...matches].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const m of sorted) {
    const rh = r[m.home] ?? base, ra = r[m.away] ?? base;
    const e = 1 / (1 + 10 ** ((ra - rh - hfa) / 400));
    const s = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0;
    const gd = Math.abs(m.hg - m.ag);
    const mult = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
    const d = k * mult * (s - e);
    r[m.home] = rh + d; r[m.away] = ra - d;
  }
  return r;
}

export function eloProbs(rh, ra, hfa = 60) {
  const e = 1 / (1 + 10 ** ((ra - rh - hfa) / 400));
  const diff = Math.abs(rh + hfa - ra);
  const pd = 0.3 * Math.exp(-1.5 * (diff / 400) ** 2);
  const ph = Math.max(0.01, e - pd / 2), pa = Math.max(0.01, 1 - e - pd / 2);
  const t = ph + pd + pa;
  return { home: ph / t, draw: pd / t, away: pa / t };
}

export function strengths(matches, asOf, { halfLifeDays = 180, shrink = 6 } = {}) {
  const w = (m) => 0.5 ** (Math.max(0, asOf - Date.parse(m.date)) / DAY / halfLifeDays);
  let sw = 0, gh = 0, ga = 0;
  for (const m of matches) { const x = w(m); sw += x; gh += x * m.hg; ga += x * m.ag; }
  const mu = (gh + ga) / (2 * sw);
  const hfa = Math.max(0.8, Math.min(1.5, gh / Math.max(ga, 1e-9)));
  const t = {};
  const add = (name, sc, co, x) => {
    const e = (t[name] ??= { sw: 0, sc: 0, co: 0, n: 0 });
    e.sw += x; e.sc += x * sc; e.co += x * co; e.n++;
  };
  for (const m of matches) { const x = w(m); add(m.home, m.hg, m.ag, x); add(m.away, m.ag, m.hg, x); }
  const out = {};
  for (const [name, e] of Object.entries(t)) {
    out[name] = {
      att: (e.sc + shrink * mu) / (e.sw + shrink) / mu,
      def: (e.co + shrink * mu) / (e.sw + shrink) / mu,
      n: e.n,
    };
  }
  return { mu, hfa, teams: out };
}

export function formOf(matches, team, count = 5) {
  const own = matches.filter((m) => m.home === team || m.away === team)
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, count);
  let pts = 0, wsum = 0; const seq = [];
  own.forEach((m, i) => {
    const gf = m.home === team ? m.hg : m.ag, gc = m.home === team ? m.ag : m.hg;
    const r = gf > gc ? 'V' : gf === gc ? 'N' : 'D';
    const w = 1 - i * 0.12;
    pts += w * (r === 'V' ? 3 : r === 'N' ? 1 : 0); wsum += w; seq.push(r);
  });
  return { seq, ppg: wsum ? +(pts / wsum).toFixed(2) : null, n: own.length };
}

// Arrondi à 100 % exact (méthode du plus grand reste).
export function toPercents(p) {
  const keys = Object.keys(p); const raw = keys.map((k) => p[k] * 100);
  const fl = raw.map(Math.floor); let rest = 100 - fl.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { fl[i]++; rest--; } });
  return Object.fromEntries(keys.map((k, i) => [k, fl[i]]));
}

export function analyze(matches, home, away, asOf = Date.now()) {
  if (!home || !away || home === away) throw new Error('Choisissez deux équipes différentes.');
  const names = new Set(matches.flatMap((m) => [m.home, m.away]));
  if (!names.has(home) || !names.has(away)) throw new Error('Équipe inconnue dans les données disponibles.');
  const S = strengths(matches, asOf);
  const H = S.teams[home], A = S.teams[away];
  const root = Math.sqrt(S.hfa);
  const lh = S.mu * H.att * A.def * root, la = S.mu * A.att * H.def / root;
  const grid = scoreGrid(lh, la);
  const elo = eloRatings(matches);
  const ep = eloProbs(elo[home] ?? 1500, elo[away] ?? 1500);
  const WP = 0.65;
  const blend = {
    home: WP * grid.home + (1 - WP) * ep.home,
    draw: WP * grid.draw + (1 - WP) * ep.draw,
    away: WP * grid.away + (1 - WP) * ep.away,
  };
  const pct = toPercents(blend);
  const fH = formOf(matches, home), fA = formOf(matches, away);
  const h2h = matches.filter((m) => (m.home === home && m.away === away) || (m.home === away && m.away === home))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const rec = { [home]: 0, nul: 0, [away]: 0 };
  h2h.forEach((m) => { if (m.hg === m.ag) rec.nul++; else rec[(m.hg > m.ag) === (m.home === home) ? home : away]++; });
  const n = Math.min(H.n, A.n);
  const lastTs = Math.max(...matches.filter((m) => [home, away].includes(m.home) || [home, away].includes(m.away)).map((m) => Date.parse(m.date)));
  const ageDays = Math.round((asOf - lastTs) / DAY);
  const score = Math.min(1, n / 30) * (ageDays > 365 ? 0.6 : 1);
  const level = score < 0.35 ? 'faible' : score < 0.7 ? 'moyen' : 'élevé';
  const margin = Math.round(100 * 0.5 / Math.sqrt(n + 4));
  let under3 = 0;
  grid.cells.forEach((c) => { if (c.h + c.a <= 2) under3 += c.p; });
  const factors = [];
  if (fH.ppg != null && fA.ppg != null && Math.abs(fH.ppg - fA.ppg) > 0.8) factors.push('Écart de forme marqué : un changement de dynamique peut modifier l\'analyse.');
  if (n < 15) factors.push('Peu de matchs observés : les estimations sont instables.');
  if (ageDays > 180) factors.push('Dernières données anciennes (' + ageDays + ' jours).');
  factors.push('Blessures, suspensions et compositions ne sont pas intégrées faute de source fiable.');
  const strong = (s) => [s.att > 1.1 && 'Attaque supérieure à la moyenne', s.def < 0.9 && 'Défense solide (peu de buts encaissés)'].filter(Boolean);
  const weak = (s) => [s.att < 0.9 && 'Attaque inférieure à la moyenne', s.def > 1.1 && 'Défense fragile (beaucoup de buts encaissés)'].filter(Boolean);
  return {
    model_version: MODEL_VERSION, home, away,
    probabilities: pct,
    models: { poisson: toPercents(grid), elo: toPercents(ep), weights: { poisson: WP, elo: +(1 - WP).toFixed(2) } },
    xg: { home: +lh.toFixed(2), away: +la.toFixed(2), note: 'Buts attendus estimés par le modèle de Poisson (pas des xG issus de tirs).' },
    heat: Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => +(grid.cells.find((c) => c.h === i && c.a === j).p * 100).toFixed(1))),
    top_scores: [...grid.cells].sort((a, b) => b.p - a.p).slice(0, 5).map((c) => ({ score: `${c.h}-${c.a}`, pct: +(c.p * 100).toFixed(1) })),
    elo: { home: Math.round(elo[home] ?? 1500), away: Math.round(elo[away] ?? 1500) },
    form: { home: fH, away: fA },
    h2h: { record: rec, last: h2h.slice(0, 5).map((m) => ({ date: m.date, home: m.home, away: m.away, score: `${m.hg}-${m.ag}` })) },
    strengths: { home: strong(H), away: strong(A) },
    weaknesses: { home: weak(H), away: weak(A) },
    team_stats: { home: { att: +H.att.toFixed(2), def: +H.def.toFixed(2), n: H.n }, away: { att: +A.att.toFixed(2), def: +A.def.toFixed(2), n: A.n } },
    trends: [
      `Total de buts attendu : ${(lh + la).toFixed(2)}`,
      `Plus de 2,5 buts : ${Math.round((1 - under3) * 100)} % (estimation)`,
    ],
    confidence: { level, score: +score.toFixed(2), margin_points: margin, note: `Marge indicative d'environ ±${margin} points, d'après ${n} matchs minimum par équipe.` },
    factors,
    limits: ['Modèle simple fondé uniquement sur les scores passés.', 'Aucun xG, joueur, entraîneur ou composition dans cette version.', 'Estimation, jamais une certitude. Aucun conseil de pari.'],
    explanation: `Le modèle estime ${lh.toFixed(2)} but(s) pour ${home} et ${la.toFixed(2)} pour ${away}. En combinant Poisson (65 %) et Elo (35 %) : ${home} gagne dans ${pct.home} % des cas simulés, match nul ${pct.draw} %, ${away} gagne ${pct.away} %. Fiabilité : ${level}.`,
    data: { matches_used: matches.length, last_match_age_days: ageDays },
  };
}

// Comparateur : uniquement des statistiques calculées à partir des résultats disponibles.
export function teamProfile(matches, team, asOf = Date.now()) {
  const own = matches.filter((m) => m.home === team || m.away === team);
  if (!own.length) throw new Error('Équipe inconnue dans les données disponibles.');
  const acc = () => ({ n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
  const tot = acc(), hm = acc(), aw = acc(); let cs = 0, btts = 0, o25 = 0;
  for (const m of own) {
    const isH = m.home === team, gf = isH ? m.hg : m.ag, ga = isH ? m.ag : m.hg;
    for (const a of [tot, isH ? hm : aw]) { a.n++; a.gf += gf; a.ga += ga; if (gf > ga) a.w++; else if (gf === ga) a.d++; else a.l++; }
    if (ga === 0) cs++; if (gf > 0 && ga > 0) btts++; if (gf + ga > 2) o25++;
  }
  const fin = (a) => ({ ...a, ppg: +((3 * a.w + a.d) / (a.n || 1)).toFixed(2), gf_pg: +(a.gf / (a.n || 1)).toFixed(2), ga_pg: +(a.ga / (a.n || 1)).toFixed(2) });
  const S = strengths(matches, asOf), elo = eloRatings(matches);
  return { team, overall: fin(tot), home: fin(hm), away: fin(aw), form: formOf(matches, team), elo: Math.round(elo[team] ?? 1500),
    att: +S.teams[team].att.toFixed(2), def: +S.teams[team].def.toFixed(2),
    tendencies: { clean_sheet_pct: Math.round(100 * cs / own.length), btts_pct: Math.round(100 * btts / own.length), over25_pct: Math.round(100 * o25 / own.length) } };
}
export function compareTeams(matches, a, b, asOf = Date.now()) {
  if (!a || !b || a === b) throw new Error('Choisissez deux équipes différentes.');
  const h2h = matches.filter((m) => (m.home === a && m.away === b) || (m.home === b && m.away === a)).sort((x, y) => (x.date < y.date ? 1 : -1));
  const rec = { a: 0, draw: 0, b: 0 };
  h2h.forEach((m) => { if (m.hg === m.ag) rec.draw++; else rec[(m.hg > m.ag) === (m.home === a) ? 'a' : 'b']++; });
  return { a: teamProfile(matches, a, asOf), b: teamProfile(matches, b, asOf), h2h: { record: rec, last: h2h.slice(0, 5).map((m) => ({ date: m.date, home: m.home, away: m.away, score: `${m.hg}-${m.ag}` })) } };
}
