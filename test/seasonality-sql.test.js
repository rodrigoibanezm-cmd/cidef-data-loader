import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonalitySourceSql, cidefCoverageSql,
  safeNoteTimestampSql } from '../lib/seasonality-source-sql.js';
import { monthlySeasonalitySql } from '../lib/monthly-seasonality-sql.js';
import { intramonthWeekSql } from '../lib/intramonth-week-sql.js';

const market = { scope: 'MARKET', group_by: 'TOTAL' };
const cidef = { scope: 'CIDEF', group_by: 'SUCURSAL' };

test('MARKET reads only RVM and cannot infer branch or seller', () => {
  const sql = seasonalitySourceSql(market);
  assert.match(sql, /FROM rvm_raw/);
  assert.doesNotMatch(sql, /notas_venta_raw|seller|branch/);
});

test('CIDEF brands remain explicit and are not normalized into each other', () => {
  const sql = seasonalitySourceSql(cidef);
  assert.match(sql, /ARRAY\['FOTON','DFM','DONGFENG'\]/);
  assert.doesNotMatch(sql, /DFM.*THEN.*DONGFENG/s);
});

test('notes are reduced to one normalized chassis before joining RVM', () => {
  const sql = seasonalitySourceSql(cidef);
  assert.match(sql, /ROW_NUMBER\(\) OVER \(PARTITION BY UPPER\(TRIM\(n\.chasis\)\)/);
  assert.match(sql, /notes_one AS .*choice=1/s);
  assert.match(sql, /LEFT JOIN notes_one n ON n\.join_key=f\.join_key/);
  assert.match(sql, /to_timestamp\(TRIM\(n\.fecha_factura\),'MM\/DD\/YY HH24:MI'\)/);
  assert.match(sql, /to_timestamp\(TRIM\(n\.fecha_nota_de_venta\),'MM\/DD\/YY HH24:MI'\)/);
});

test('note timestamps are guarded so malformed dates become null', () => {
  const sql = safeNoteTimestampSql('n.fecha_factura');
  assert.match(sql, /CASE WHEN .* ~ '\^\(0\?\[1-9\]/s);
  assert.match(sql, /::int=2 THEN 28\+CASE WHEN MOD\(/);
  assert.match(sql, /THEN to_timestamp\(.*'MM\/DD\/YY HH24:MI'\).*ELSE NULL/s);
});

test('validated real values have chronological, not lexicographic, order', () => {
  const parse = value => {
    const [date, time] = value.split(' ');
    const [month, day, year] = date.split('/').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    return Date.UTC(2000 + year, month - 1, day, hour, minute);
  };
  for (const [newer, older] of [['12/1/22 0:00', '6/4/22 0:00'],
    ['10/19/22 0:00', '6/2/22 0:00'], ['6/2/22 0:00', '5/31/20 0:00']]) {
    assert.ok(parse(newer) > parse(older));
  }
  assert.ok('12/1/22 0:00' < '6/4/22 0:00');
});

test('coverage exposes matched and unmatched RVM rows before entity filters', () => {
  const sql = cidefCoverageSql(cidef);
  assert.match(sql, /COUNT\(\*\)::int AS rvm_cidef/);
  assert.match(sql, /matched_key IS NOT NULL.*AS matched/s);
  assert.match(sql, /matched_key IS NULL.*AS unmatched/s);
  assert.match(sql, /100\.0\*COUNT/);
  assert.doesNotMatch(sql, /branch=\$5|seller=\$6/);
});

test('monthly weights and ranks preserve year, quarter and group grain', () => {
  const sql = monthlySeasonalitySql({ scope: 'CIDEF', group_by: 'VENDEDOR' });
  assert.match(sql, /PARTITION BY group_value,year\)/);
  assert.match(sql, /PARTITION BY group_value,year,quarter/);
  assert.match(sql, /PARTITION BY group_value,month_number/);
  assert.match(sql, /DENSE_RANK\(\).*PARTITION BY group_value,year/s);
});

test('intramonth weeks use day buckets and last seven calendar days', () => {
  const sql = intramonthWeekSql(market);
  for (const range of ['1 AND 7', '8 AND 14', '15 AND 21', '22 AND 28']) assert.match(sql, new RegExp(range));
  assert.match(sql, /EXTRACT\(DAY FROM event_date\) >= 29/);
  assert.match(sql, /interval '1 month' - interval '7 days'/);
  assert.doesNotMatch(sql, /ISOWEEK|date_part\('week'/i);
});

test('group pagination selects whole values before monthly aggregation', () => {
  for (const sql of [monthlySeasonalitySql(market), intramonthWeekSql(market)]) {
    assert.match(sql, /selected_groups AS .*LIMIT \$5::integer OFFSET \$6::integer/s);
    assert.match(sql, /JOIN selected_groups g USING\(group_value\)/);
  }
  for (const sql of [monthlySeasonalitySql(cidef), intramonthWeekSql(cidef)]) {
    assert.match(sql, /LIMIT \$7::integer OFFSET \$8::integer/);
  }
});
