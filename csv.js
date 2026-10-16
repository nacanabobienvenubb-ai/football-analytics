// Analyse des fichiers CSV importés (matchs, joueurs, entraîneurs).
export function splitLine(l) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim()); return out;
}
function table(text, need) {
  const lines = String(text).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const head = splitLine(lines.shift() || '').map((s) => s.toLowerCase());
  if (need.some((k) => !head.includes(k))) throw new Error('En-têtes requis : ' + need.join(','));
  return lines.map((l, i) => ({ n: i + 2, o: l.trim() ? Object.fromEntries(splitLine(l).map((v, j) => [head[j], v])) : null })).filter((r) => r.o);
}
const int = (v, n, max = 1e6) => { const x = Number(v === '' || v == null ? 0 : v); if (!Number.isInteger(x) || x < 0 || x > max) throw new Error('Nombre invalide ligne ' + n); return x; };
const txt = (v, n, req, max = 80) => { const s = String(v ?? '').trim(); if ((req && !s) || s.length > max) throw new Error('Texte invalide ligne ' + n); return s; };
const dateOk = (v, n, req) => { if (!v && !req) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Date invalide ligne ' + n + ' (AAAA-MM-JJ)'); return v; };

export function parseCsv(text) {
  return table(text, ['date', 'competition', 'home', 'away', 'home_goals', 'away_goals']).map(({ n, o }) => {
    const r = { date: dateOk(o.date, n, true), competition: txt(o.competition, n, false) || '—', home: txt(o.home, n, true), away: txt(o.away, n, true), hg: int(o.home_goals, n, 30), ag: int(o.away_goals, n, 30) };
    if (r.home === r.away) throw new Error('Équipes identiques ligne ' + n);
    return r;
  });
}
export function parsePlayers(text) {
  return table(text, ['name', 'team']).map(({ n, o }) => ({ name: txt(o.name, n, true), team: txt(o.team, n, true), position: txt(o.position, n, false, 30), season: txt(o.season, n, false, 30),
    minutes: int(o.minutes, n, 20000), starts: int(o.starts, n, 100), sub_apps: int(o.sub_apps, n, 100), goals: int(o.goals, n, 200), assists: int(o.assists, n, 200), shots: int(o.shots, n, 2000) }));
}
export function parseCoaches(text) {
  return table(text, ['name', 'team']).map(({ n, o }) => {
    const r = { name: txt(o.name, n, true), team: txt(o.team, n, true), start_date: dateOk(o.start_date, n, false), end_date: dateOk(o.end_date, n, false), matches: int(o.matches, n, 3000), wins: int(o.wins, n, 3000), draws: int(o.draws, n, 3000), losses: int(o.losses, n, 3000), style_note: txt(o.style_note, n, false, 200) };
    if (r.wins + r.draws + r.losses > r.matches) throw new Error('V+N+D supérieur au nombre de matchs, ligne ' + n);
    return r;
  });
}
