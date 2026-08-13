import test from 'node:test';
import assert from 'node:assert/strict';
import { geographyPageSql } from '../lib/geographic-market-base-sql.js';
import { geographicSummarySql } from '../lib/geographic-market-summary-sql.js';
import { geographicSeriesSql } from '../lib/geographic-market-series-sql.js';

test('REGION and COMUNA use only their declared RVM columns', () => {
  assert.match(geographyPageSql('REGION'), /r\.region_propietario/);
  assert.match(geographyPageSql('COMUNA'), /r\.comuna_adquisicion/);
});

test('ALL and CHINA share one explicit universe predicate', () => {
  const sql = geographicSummarySql('REGION');
  assert.match(sql, /\$6::text='ALL' OR b\.origen_marca='CHINA'/);
});

test('brand filtering happens after denominator and ranking', () => {
  const sql = geographicSummarySql('REGION');
  const totals = sql.indexOf('totals AS');
  const ranked = sql.indexOf('ranked AS');
  const focus = sql.indexOf("WHERE $8::text IS NULL OR marca=$8");
  assert.ok(totals > 0 && ranked > totals && focus > ranked);
  assert.doesNotMatch(sql.slice(0, totals), /marca=\$8/);
});

test('ranking is deterministic within every geography', () => {
  for (const sql of [geographicSummarySql('REGION'), geographicSeriesSql('COMUNA')]) {
    assert.match(sql, /ORDER BY (?:b\.|c\.)?(?:brand_units|units) DESC,(?:b\.|c\.)?marca ASC/);
  }
});

test('specific segment is applied before market aggregation', () => {
  assert.match(geographicSummarySql('REGION'), /descripcion_segmento='CAMIONETA'.*'PICK-UP'/s);
  assert.match(geographicSummarySql('REGION'), /\$7::text='TOTAL'/);
});
