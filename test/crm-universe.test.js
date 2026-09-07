import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assembleCrmUniverse, buildCrmUniverseQuery } from '../lib/crm-universe/buildCrmUniverse.js';
import { assembleCrmLongitudinalFromUniverse, parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';

function sourceRow(extra = {}) {
  return {
    lead_id: '1', source_rows: 5, created_date: '2026-01-05', assigned_date: '2026-01-05', managed_date: '2026-01-06', desist_date: null,
    managed_raw: '06-01-2026', estado_raw: 'Oportunidad', status_norm: 'OPORTUNIDAD', vendido_raw: 'No', sold_norm: 'NO',
    interest_level: 'Alto', interest_level_norm: 'ALTO', desist_reason: null, desist_reason_norm: null,
    origin_raw: 'WEB SITE', origin_norm: 'WEB SITE', suborigin_raw: 'P. web Cotizador FOTON', suborigin_norm: 'P WEB COTIZADOR FOTON',
    product_interest_raw: 'Foton G7', product_interest_norm: 'FOTON G7', brand_match_count: 1, model_match_count: 1, brand_id: 2, brand: 'FOTON', model_id: 20, model: 'G7',
    store_raw: 'Bellavista', store_raw_norm: 'BELLAVISTA', store_match_count: 1, sucursal_id: 7, sucursal_nombre: 'BELLAVISTA', tipo_canal: 'CIDEF',
    seller_raw: 'Ana Perez', seller_raw_norm: 'ANA PEREZ', seller_match_count: 1, persona_id: 100, persona_nombre: 'ANA PEREZ', eligible_vendedor_cidef: true,
    ...extra,
  };
}
function rawRows() {
  return [
    sourceRow(),
    sourceRow({ lead_id: '2', created_date: '2026-01-10', managed_date: null, managed_raw: '', origin_raw: 'CHAT', origin_norm: 'CHAT', suborigin_raw: 'Chat Regiones Dongfeng', suborigin_norm: 'CHAT REGIONES DONGFENG', vendido_raw: 'Si', sold_norm: 'SI', estado_raw: 'Cerrado', status_norm: 'CERRADO', brand_id: 1, brand: 'DONGFENG', model_id: 10, model: 'MAGE', product_interest_raw: 'Dongfeng Mage', product_interest_norm: 'DONGFENG MAGE' }),
    sourceRow({ lead_id: '3', created_date: '2026-02-03', managed_date: '2026-02-04', managed_raw: '04-02-2026', desist_date: '2026-02-20', desist_raw: '20-02-2026', origin_raw: 'RRSS', origin_norm: 'RRSS', suborigin_raw: 'RRSS Suc. Bellavista FOTON', suborigin_norm: 'RRSS SUC BELLAVISTA FOTON', estado_raw: 'Desistido', status_norm: 'DESISTIDO' }),
    sourceRow({ lead_id: '4', store_raw: 'Automotora Austral', store_raw_norm: 'AUTOMOTORA AUSTRAL', store_match_count: null, sucursal_id: null, sucursal_nombre: null, tipo_canal: null, seller_match_count: null, persona_id: null, persona_nombre: null, eligible_vendedor_cidef: false, origin_raw: 'SHOWROOM', origin_norm: 'SHOWROOM' }),
    sourceRow({ lead_id: '5', product_interest_raw: null, product_interest_norm: null, brand_match_count: null, model_match_count: null, brand_id: null, brand: null, model_id: null, model: null, origin_raw: 'BASE DE CLIENTES', origin_norm: 'BASE DE CLIENTES', suborigin_raw: null, suborigin_norm: null }),
  ];
}
function universe(commercial = 'COMPANY') { return assembleCrmUniverse(rawRows(), { commercial_universe: commercial, date_from: '2026-01-01', date_to: '2026-02-28' }); }
function parsed(extra = {}) { return parseCrmLongitudinalInput({ commercial_universe: 'COMPANY', metric: 'LEADS_CREATED', grain: 'TOTAL', mode: 'EVENT', date_axis: 'CREATED_AT', date_from: '2026-01-01', date_to: '2026-02-28', time_grain: 'MONTH', ...extra }); }

test('crm_universe_v01 reconciles company grain and OWN_STORES membership', () => {
  const company = universe(); const own = universe('OWN_STORES');
  assert.equal(company.universe, 'crm_universe_v01');
  assert.equal(company.validation.deduplicated_leads, company.analytical_events.length);
  assert.ok(own.analytical_events.length <= company.analytical_events.length);
  assert.ok(own.analytical_events.every((row) => row.store_resolution_status === 'RESOLVED' && row.tipo_canal === 'CIDEF'));
  assert.equal(company.coverage.origin.non_null, 5);
  assert.equal(company.coverage.suborigin.null, 1);
});

test('builder composes existing RAW/MASTER authorities and preserves defensive dedup', () => {
  const sql = buildCrmUniverseQuery({ eligibilityDateAxis: 'MANAGED_AT' });
  for (const token of ['CRM_Cidef_raw','producto_aliases_v01','versiones_master_v01','modelos_master_v01','marcas_master_v01','sucursal_aliases','sucursales_master','persona_aliases','personas_master','vendedor_cidef']) assert.match(sql, new RegExp(token));
  assert.match(sql, /PARTITION BY coalesce\(nullif\(trim\("ID"\),''\),ctid::text\)/);
  assert.match(sql, /loaded_at/); assert.match(sql, /ctid DESC/); assert.doesNotMatch(sql, /"Marca"/);
});

test('longitudinal consumes analytical_events and does not reconstruct identity locally', () => {
  const source = fs.readFileSync(new URL('../lib/longitudinal/crm.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(product_candidates|product_map|store_candidates|store_map|seller_candidates|seller_map|vendedor_cidef\s+AS|WITH\s+dedup|customGptDb)\b/);
  assert.doesNotMatch(source, /FROM\s+\"CRM_Cidef_raw\"/); assert.match(source, /buildCrmUniverse/);
  assert.deepEqual(assembleCrmLongitudinalFromUniverse(parsed(), universe()).series.map((row) => row.value), [4, 1]);
});

test('Origen/Suborigen are preserved and breakdowns do not duplicate leads', () => {
  for (const breakdown of ['ORIGIN','SUBORIGIN']) {
    const result = assembleCrmLongitudinalFromUniverse(parsed({ breakdown }), universe());
    result.series.forEach((total, i) => assert.equal(result.seriesByBreakdown.reduce((sum, bucket) => sum + bucket.series[i].value, 0), total.value));
  }
  const origins = assembleCrmLongitudinalFromUniverse(parsed({ breakdown: 'ORIGIN' }), universe()).seriesByBreakdown.map((row) => row.key);
  for (const expected of ['CHAT','WEB SITE','RRSS','SHOWROOM','BASE DE CLIENTES']) assert.ok(origins.includes(expected));
});

test('current CRM metric predicates remain deterministic over the prepared universe', () => {
  const cases = [['SOLD',1],['MANAGED',4],['MANAGEMENT_COVERAGE',4/5],['CONVERSION_ON_MANAGED',0],['CONVERSION_RATE',1/5],['OPPORTUNITY',3],['CLOSED',1],['DESISTED',1]];
  for (const [metric, expected] of cases) {
    const result = assembleCrmLongitudinalFromUniverse(parsed({ metric, mode: 'COHORT', cohort_axis: 'CREATED_AT' }), universe());
    if (['MANAGEMENT_COVERAGE','CONVERSION_ON_MANAGED','CONVERSION_RATE'].includes(metric)) {
      const numerator = result.series.reduce((sum,row) => sum + row.numerator,0); const denominator = result.series.reduce((sum,row) => sum + row.denominator,0);
      assert.equal(denominator ? numerator/denominator : null, expected);
    } else assert.equal(result.series.reduce((sum,row) => sum + row.value,0), expected);
  }
});
