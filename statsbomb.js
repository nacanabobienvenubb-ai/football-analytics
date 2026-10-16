// Convertit un dossier local « open-data » de StatsBomb en trois CSV importables.
// Licence : respectez les conditions de StatsBomb (attribution obligatoire) — https://github.com/statsbomb/open-data
import fs from 'node:fs';
import path from 'node:path';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = (cols, rows) => [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n') + '\n';
const mm = (t) => { if (!t) return null; const [m, s] = t.split(':').map(Number); return m + (s || 0) / 60; };

export function convert(dir, competitionId, seasonId) {
  const matches = readJson(path.join(dir, 'data', 'matches', String(competitionId), `${seasonId}.json`));
  const mrows = [], coachAgg = {}, playerAgg = {};
  for (const m of matches) {
    const home = m.home_team.home_team_name, away = m.away_team.away_team_name, date = m.match_date;
    mrows.push({ date, competition: m.competition?.competition_name || '—', home, away, home_goals: m.home_score, away_goals: m.away_score });
    for (const [side, team, gf, ga] of [['home', home, m.home_score, m.away_score], ['away', away, m.away_score, m.home_score]]) {
      for (const mg of m[`${side}_team`].managers || []) {
        const c = (coachAgg[mg.name + '|' + team] ??= { name: mg.name, team, start_date: date, end_date: date, matches: 0, wins: 0, draws: 0, losses: 0, style_note: '' });
        c.matches++; if (gf > ga) c.wins++; else if (gf === ga) c.draws++; else c.losses++;
        if (date < c.start_date) c.start_date = date; if (date > c.end_date) c.end_date = date;
      }
    }
    const season = m.season?.season_name || '';
    const lp = path.join(dir, 'data', 'lineups', `${m.match_id}.json`);
    if (fs.existsSync(lp)) for (const t of readJson(lp)) for (const pl of t.lineup) {
      const pos = pl.positions || []; if (!pos.length) continue;
      const k = `${pl.player_name}|${t.team_name}|${season}`;
      const e = (playerAgg[k] ??= { name: pl.player_name, team: t.team_name, position: pos[0].position, season, minutes: 0, starts: 0, sub_apps: 0, goals: 0, assists: 0, shots: 0 });
      let min = 0; for (const p of pos) min += Math.max(0, (p.to ? mm(p.to) : 90) - mm(p.from));
      e.minutes += Math.round(min);
      if (pos[0].start_reason === 'Starting XI') e.starts++; else e.sub_apps++;
    }
    const ep = path.join(dir, 'data', 'events', `${m.match_id}.json`);
    if (fs.existsSync(ep)) for (const ev of readJson(ep)) {
      const team = ev.team?.name, name = ev.player?.name; if (!name) continue;
      const e = playerAgg[`${name}|${team}|${season}`]; if (!e) continue;
      if (ev.type?.name === 'Shot') { e.shots++; if (ev.shot?.outcome?.name === 'Goal') e.goals++; }
      if (ev.type?.name === 'Pass' && ev.pass?.goal_assist) e.assists++;
    }
  }
  return {
    matches: toCsv(['date', 'competition', 'home', 'away', 'home_goals', 'away_goals'], mrows),
    players: toCsv(['name', 'team', 'position', 'season', 'minutes', 'starts', 'sub_apps', 'goals', 'assists', 'shots'], Object.values(playerAgg)),
    coaches: toCsv(['name', 'team', 'start_date', 'end_date', 'matches', 'wins', 'draws', 'losses', 'style_note'], Object.values(coachAgg)),
  };
}
