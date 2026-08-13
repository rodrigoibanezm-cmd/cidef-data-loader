import assert from 'node:assert/strict';
import { rvmDb } from '../lib/rvm-db.js';
import { run as monthly } from '../lib/motors/monthly-seasonality-analysis.js';
import { run as weekly } from '../lib/motors/intramonth-week-curve.js';

const sql = rvmDb();
const expected = {
  rvm_raw: ['fecha', 'marca', 'modelo_homologado', 'cantidad', 'vin', 'n_chasis'],
  notas_venta_raw: ['chasis', 'vendedor', 'desc_sucursal_vta', 'fecha_factura', 'fecha_nota_de_venta'],
};
for (const [table, columns] of Object.entries(expected)) {
  const rows = await sql.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=$1`, [table]);
  const actual = new Set(rows.map(row => row.column_name));
  columns.forEach(column => assert.ok(actual.has(column), `${table}.${column} missing`));
}

const [dateOrder] = await sql.query(`SELECT
  to_timestamp('12/1/22 0:00','MM/DD/YY HH24:MI') >
    to_timestamp('6/4/22 0:00','MM/DD/YY HH24:MI') AS december_after_june,
  to_timestamp('10/19/22 0:00','MM/DD/YY HH24:MI') >
    to_timestamp('6/2/22 0:00','MM/DD/YY HH24:MI') AS october_after_june,
  to_timestamp('6/2/22 0:00','MM/DD/YY HH24:MI') >
    to_timestamp('5/31/20 0:00','MM/DD/YY HH24:MI') AS newer_year`);
assert.deepEqual(dateOrder, {
  december_after_june: true, october_after_june: true, newer_year: true,
});

const groups = [
  ['MARKET', 'TOTAL'], ['MARKET', 'MARCA'], ['MARKET', 'MODELO'],
  ['CIDEF', 'TOTAL'], ['CIDEF', 'SUCURSAL'], ['CIDEF', 'VENDEDOR'],
];
const base = { date_from: '2025-01', date_to: '2026-07', page_size: 5 };
const monthResults = [];
const weekResults = [];
for (const [scope, group_by] of groups) {
  monthResults.push(await monthly({ ...base, scope, group_by }));
  weekResults.push(await weekly({ ...base, scope, group_by }));
}

function assertSums(series, keys) {
  const sums = new Map();
  for (const row of series) {
    const key = keys.map(name => row[name]).join('|');
    sums.set(key, (sums.get(key) || 0) + row[keys.at(-1) === 'quarter' ? 'quarter_weight_pct' : 'annual_weight_pct']);
  }
  for (const value of sums.values()) assert.ok(Math.abs(value - 100) < 0.01, `weight sum ${value}`);
}
for (const result of monthResults) {
  assertSums(result.series, ['group_value', 'year']);
  assertSums(result.series, ['group_value', 'year', 'quarter']);
}
for (const result of weekResults) for (const row of result.series) {
  const total = [1, 2, 3, 4, 5].reduce((sum, week) => sum + row[`share_w${week}_pct`], 0);
  assert.ok(Math.abs(total - 100) < 0.01, `week sum ${total}`);
}

const february = await weekly({ scope: 'MARKET', date_from: '2026-02', date_to: '2026-02' });
assert.equal(february.series[0].share_w5_pct, 0);
const july = await weekly({ scope: 'MARKET', date_from: '2026-07', date_to: '2026-07' });
const [direct] = await sql.query(`SELECT SUM(cantidad)::numeric AS units,
  SUM(cantidad) FILTER (WHERE EXTRACT(DAY FROM fecha)>=29)::numeric AS w5,
  SUM(cantidad) FILTER (WHERE fecha>=DATE '2026-07-25')::numeric AS last7
  FROM rvm_raw WHERE fecha>=DATE '2026-07-01' AND fecha<DATE '2026-08-01'`);
const pct = value => Number((100 * Number(value) / Number(direct.units)).toFixed(4));
assert.equal(july.series[0].share_w5_pct, pct(direct.w5));
assert.equal(july.series[0].last_7_days_share_pct, pct(direct.last7));

const [grain] = await sql.query(`WITH f AS (SELECT UPPER(COALESCE(NULLIF(TRIM(vin),''),
  NULLIF(TRIM(n_chasis),''))) AS key FROM rvm_raw WHERE fecha>=DATE '2026-07-01'
  AND fecha<DATE '2026-08-01' AND UPPER(TRIM(marca))=ANY(ARRAY['FOTON','DFM','DONGFENG'])),
  n AS (SELECT DISTINCT UPPER(TRIM(chasis)) AS key FROM notas_venta_raw)
  SELECT (SELECT COUNT(*) FROM f)::int AS raw_rows,COUNT(*)::int AS joined_rows
  FROM f LEFT JOIN n USING(key)`);
assert.equal(grain.joined_rows, grain.raw_rows);
for (const result of [...monthResults, ...weekResults].filter(item => item.scope === 'CIDEF')) {
  assert.equal(result.coverage.matched + result.coverage.unmatched, result.coverage.rvm_cidef);
}
console.log(JSON.stringify({ status: 'PASS', cases: groups.length * 2, grain }));
