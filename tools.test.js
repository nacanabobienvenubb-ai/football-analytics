import test from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../tools/statsbomb.js';
import { parseCsv, parsePlayers, parseCoaches } from '../src/csv.js';
import { compareTeams } from '../src/models.js';
import demo from '../data/demo.js';

test('Conversion StatsBomb (fixture synthétique) → CSV valides pour l\'import', () => {
  const r = convert(new URL('./fixtures/sb', import.meta.url).pathname, 9, 1);
  const m = parseCsv(r.matches), p = parsePlayers(r.players), c = parseCoaches(r.coaches);
  assert.equal(m.length, 2);
  const st = p.find((x) => x.name === 'Alpha Starter'), sub = p.find((x) => x.name === 'Alpha Sub');
  assert.equal(st.starts, 2); assert.equal(st.goals, 1); assert.equal(st.shots, 2); assert.equal(st.minutes, 180);
  assert.equal(sub.sub_apps, 2); assert.equal(sub.assists, 1); assert.equal(sub.minutes, 40);
  const ch = c.find((x) => x.name === 'Coach H'); assert.equal(ch.wins, 1); assert.equal(c.find((x) => x.name === 'Coach A' && x.team === 'Alpha').draws, 1);
});
test('CSV : guillemets, entiers invalides, V+N+D incohérent', () => {
  assert.equal(parsePlayers('name,team\n"Dupont, Jean",A')[0].name, 'Dupont, Jean');
  assert.throws(() => parsePlayers('name,team,goals\nX,A,-1'));
  assert.throws(() => parseCoaches('name,team,matches,wins\nX,A,1,5'));
});
test('Comparateur : cohérence des totaux', () => {
  const c = compareTeams(demo.matches, 'Atlas FC', 'Boréal United', Date.parse('2026-06-01'));
  const o = c.a.overall; assert.equal(o.w + o.d + o.l, o.n); assert.equal(c.a.home.n + c.a.away.n, o.n);
  assert.equal(c.h2h.record.a + c.h2h.record.draw + c.h2h.record.b, c.h2h.last.length === 0 ? 0 : 6);
});
