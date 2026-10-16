import test from 'node:test';
import assert from 'node:assert/strict';
import demo from '../data/demo.js';
import { poisson, scoreGrid, eloRatings, eloProbs, toPercents, analyze } from '../src/models.js';
import { parseCsv } from '../src/csv.js';

const asOf = Date.parse('2026-06-01');

test('Poisson : somme ≈ 1 et valeur connue', () => {
  let s = 0; for (let k = 0; k < 30; k++) s += poisson(k, 1.5);
  assert.ok(Math.abs(s - 1) < 1e-9);
  assert.ok(Math.abs(poisson(0, 1) - Math.exp(-1)) < 1e-12);
});
test('Grille de scores : V/N/D somment à 1', () => {
  const g = scoreGrid(1.8, 0.9); assert.ok(Math.abs(g.home + g.draw + g.away - 1) < 1e-9); assert.ok(g.home > g.away);
});
test('Elo : le vainqueur gagne des points, équipes égales → domicile favori', () => {
  const r = eloRatings([{ date: '2025-01-01', home: 'A', away: 'B', hg: 2, ag: 0 }]);
  assert.ok(r.A > 1500 && r.B < 1500);
  const p = eloProbs(1500, 1500); assert.ok(p.home > p.away);
});
test('toPercents : total exactement 100', () => {
  for (const p of [{ a: 1 / 3, b: 1 / 3, c: 1 / 3 }, { a: 0.456, b: 0.274, c: 0.27 }]) {
    assert.equal(Object.values(toPercents(p)).reduce((x, y) => x + y, 0), 100);
  }
});
test('Analyse démo : probabilités = 100 %, équipes fortes favorisées', () => {
  const r = analyze(demo.matches, 'Atlas FC', 'Fjord City', asOf);
  const p = r.probabilities; assert.equal(p.home + p.draw + p.away, 100);
  assert.ok(p.home > p.away); assert.equal(r.top_scores.length, 5);
  assert.ok(['faible', 'moyen', 'élevé'].includes(r.confidence.level));
});
test('Analyse : refuse équipe inconnue ou identique', () => {
  assert.throws(() => analyze(demo.matches, 'Atlas FC', 'Atlas FC', asOf));
  assert.throws(() => analyze(demo.matches, 'Atlas FC', 'Inconnu', asOf));
});
test('Données de démo marquées fictives', () => {
  assert.equal(demo.fictional, true); assert.match(demo.label, /FICTIVES/);
});
test('CSV : accepte un fichier valide, rejette les lignes invalides', () => {
  const ok = 'date,competition,home,away,home_goals,away_goals\n2025-01-01,L1,A,B,2,1';
  assert.equal(parseCsv(ok).length, 1);
  assert.throws(() => parseCsv(ok + '\n2025-13,L1,A,A,x,1'));
  assert.throws(() => parseCsv('a,b\n1,2'));
});
