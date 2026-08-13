import assert from 'node:assert/strict';
import { rvmDb } from '../lib/rvm-db.js';
import { run } from '../lib/motors/geographic-market-analysis.js';
import { geographicPeriods } from '../lib/geographic-market-input.js';

const sql = rvmDb();
const expected = {
  rvm_raw: ['fecha','region_propietario','comuna_adquisicion','descripcion_segmento','marca','cantidad'],
  brands_master: ['marca','origen_marca'],
};
for (const [table, columns] of Object.entries(expected)) {
  const rows = await sql.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=$1`, [table]);
  const actual = new Set(rows.map(row => row.column_name));
  for (const column of columns) assert.ok(actual.has(column), `${table}.${column} missing`);
}

const [latest] = await sql.query(`SELECT to_char(date_trunc('month',MAX(fecha)),'YYYY-MM') AS month
  FROM rvm_raw WHERE fecha IS NOT NULL`);
const rolling = geographicPeriods(latest.month, 6, 'rolling');
assert.ok(rolling.previous.hasta < rolling.current.desde, 'rolling periods overlap');

const common = { level: 'REGION', months: 6, end_month: latest.month, page_size: 100 };
const all = await run({ ...common, universe: 'ALL', brand: null });
const focus = await run({ ...common, universe: 'ALL', brand: 'FOTON', comparison: 'rolling' });
const china = await run({ ...common, universe: 'CHINA', brand: 'FOTON', comparison: 'same_period_last_year' });
const commune = await run({ ...common, level: 'COMUNA', universe: 'ALL', brand: 'FOTON' });

const denominators = new Map(all.summary.filter(row => row.marca === 'FOTON')
  .map(row => [row.geography, row.unidades_universo]));
for (const row of focus.summary) {
  assert.equal(row.unidades_universo, denominators.get(row.geography));
}
for (const result of [all, focus, china, commune]) {
  for (const row of [...result.summary, ...result.series]) {
    for (const key of ['unidades_marca','unidades_universo','share_pct']) {
      assert.equal(typeof row[key], 'number', `${key} is not numeric`);
    }
  }
}
console.log(JSON.stringify({ latest: latest.month, all: all.summary.length,
  focus: focus.summary.length, china: china.summary.length, commune: commune.summary.length }));
