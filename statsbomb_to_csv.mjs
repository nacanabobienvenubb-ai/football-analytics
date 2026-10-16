// Usage : node tools/statsbomb_to_csv.mjs <dossier open-data> <competition_id> <season_id> [dossier de sortie]
import fs from 'node:fs';
import { convert } from './statsbomb.js';
const [dir, c, s, out = '.'] = process.argv.slice(2);
if (!dir || !c || !s) { console.error('Usage : node tools/statsbomb_to_csv.mjs <open-data> <competition_id> <season_id> [sortie]'); process.exit(1); }
const r = convert(dir, c, s);
for (const k of ['matches', 'players', 'coaches']) fs.writeFileSync(`${out}/statsbomb_${k}.csv`, r[k]);
console.log('Fichiers créés : statsbomb_matches.csv, statsbomb_players.csv, statsbomb_coaches.csv');
