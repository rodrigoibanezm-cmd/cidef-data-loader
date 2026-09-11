import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleCommercialOperationUniverse,
  buildCommercialOperationUniverse,
  buildCommercialOperationUniverseQuery,
  normalizeCommercialOperationUniverseInput,
} from '../lib/commercial-operation-universe/buildCommercialOperationUniverse.js';

const baseInput = {
  temporal_mode: 'PERIOD',
  temporal_axis: 'FORUM_COTIZACION',
  date_from: '2026-08-01',
  date_to: '2026-08-31',
  scope: { organization_scope: 'COMPANY', sucursal_ids: [], persona_ids: [], marca_ids: [], modelo_ids: [] },
  forum_final_states: [],
};

function row(overrides = {}) {
  return {
    commercial_operation_id: 'CRM:1', operation_status: 'CRM_ONLY',
    forum_numero_operacion: null, crm_deal_id: '1', vin: null,
    sucursal_id: 1, persona_id: 10, marca_id: 100, modelo_id: 1000,
    forum_sucursal_id: null, crm_sucursal_id: 1, vin_sucursal_id: null,
    forum_persona_id: null, crm_persona_id: 10,
    forum_marca_id: null, crm_marca_id: 100, vin_marca_id: null,
    forum_modelo_id: null, crm_modelo_id: 1000, vin_modelo_id: null,
    forum_fecha_cotizacion: null, crm_created_at: '2026-08-02', crm_assigned_at: '2026-08-03', fecha_factura: null,
    forum_final_state: null, forum_present: false, crm_present: true, vin_present: false,
    forum_crm_match_status: 'NOT_APPLICABLE', crm_vin_match_status: 'UNMATCHED', identity_status: 'SINGLE_SOURCE',
    crm_forum_match_count: 0, tipo_canal: 'CIDEF',
    ...overrides,
  };
}

function forumOnly(id = 1, state = 'COTIZACION') {
  return row({
    commercial_operation_id: `FORUM:${id}`, operation_status: 'FORUM_ONLY',
    forum_numero_operacion: id, crm_deal_id: null, forum_present: true, crm_present: false,
    forum_sucursal_id: 1, crm_sucursal_id: null, forum_persona_id: 10, crm_persona_id: null,
    forum_marca_id: 100, crm_marca_id: null, forum_modelo_id: 1000, crm_modelo_id: null,
    forum_fecha_cotizacion: '2026-08-05', forum_final_state: state,
    forum_crm_match_status: 'UNMATCHED',
  });
}

function forumCrm(id = 1, deal = '10', vin = null, identity = 'CONSISTENT') {
  return row({
    commercial_operation_id: `FORUM:${id}`, operation_status: vin ? 'FORUM_CRM_VIN' : 'FORUM_CRM',
    forum_numero_operacion: id, crm_deal_id: deal, vin,
    forum_present: true, crm_present: true, vin_present: Boolean(vin),
    forum_sucursal_id: 1, crm_sucursal_id: 1, vin_sucursal_id: vin ? 1 : null,
    forum_persona_id: 10, crm_persona_id: 10,
    forum_marca_id: 100, crm_marca_id: 100, vin_marca_id: vin ? 100 : null,
    forum_modelo_id: 1000, crm_modelo_id: 1000, vin_modelo_id: vin ? 1000 : null,
    forum_fecha_cotizacion: '2026-08-20', crm_created_at: '2026-08-01', crm_assigned_at: '2026-08-02', fecha_factura: vin ? '2026-07-30' : null,
    forum_final_state: vin ? 'UFIS' : 'APROBACION', forum_crm_match_status: 'MATCHED',
    crm_vin_match_status: vin ? 'MATCHED' : 'UNMATCHED', identity_status: identity,
  });
}

test('five observable operation classes are counted without collapsing the structural grain', () => {
  const rows = [
    forumOnly(1),
    row({ commercial_operation_id: 'CRM:2', crm_deal_id: '2' }),
    forumCrm(3, '3'),
    row({ commercial_operation_id: 'CRM:4', crm_deal_id: '4', vin: 'VIN4', vin_present: true, fecha_factura: '2026-08-10', crm_vin_match_status: 'MATCHED' }),
    forumCrm(5, '5', 'VIN5'),
  ];
  const out = assembleCommercialOperationUniverse(rows, baseInput);
  assert.equal(out.counts.observable_operations, 5);
  assert.equal(out.counts.forum_operations, 3);
  assert.equal(out.counts.crm_deals, 4);
  assert.equal(out.counts.vin_sales, 2);
  assert.equal(out.validation.valid, true);
});

test('mandatory cardinality: 2 Forum -> 1 CRM -> 1 VIN remains 2/1/1', () => {
  const rows = [
    forumCrm(1, '77', 'VIN77', 'MANY_FORUM_TO_ONE_CRM'),
    forumCrm(2, '77', 'VIN77', 'MANY_FORUM_TO_ONE_CRM'),
  ].map((r) => ({ ...r, crm_forum_match_count: 2 }));
  const out = assembleCommercialOperationUniverse(rows, baseInput);
  assert.deepEqual(out.counts, { observable_operations: 2, forum_operations: 2, crm_deals: 1, vin_sales: 1 });
  assert.deepEqual(out.reconciliation.many_forum_to_one_crm, { rows: 2, crm_deals: 1 });
  assert.equal(out.intersections.forum_with_vin, 2);
  assert.equal(out.intersections.vin_with_forum, 1);
});

test('SOURCE_CONFLICT is never forced through a requested canonical dimension', () => {
  const conflict = forumCrm(1, '9');
  Object.assign(conflict, { identity_status: 'SOURCE_CONFLICT', marca_id: null, forum_marca_id: 100, crm_marca_id: 200 });
  const out = assembleCommercialOperationUniverse([conflict], {
    ...baseInput, scope: { ...baseInput.scope, marca_ids: [100] },
  });
  assert.equal(out.counts.observable_operations, 0);
  assert.equal(out.identity_quality.excluded_by_requested_dimension.marca, 1);
  assert.ok(out.limitations.includes('IDENTITY_CONFLICTS_PRESENT'));
  assert.equal(out.validation.no_forced_identity_resolution, true);
});

test('Forum AMBIGUOUS remains Forum evidence without attached CRM', () => {
  const ambiguous = forumOnly(1);
  ambiguous.forum_crm_match_status = 'AMBIGUOUS';
  const out = assembleCommercialOperationUniverse([ambiguous], baseInput);
  assert.deepEqual(out.reconciliation.forum_crm, { matched: 0, ambiguous: 1, unmatched: 0 });
  assert.ok(out.limitations.includes('AMBIGUOUS_FORUM_CRM_MATCHES_PRESENT'));
});

test('PERIOD uses only the selected SALE_INVOICE axis', () => {
  const sql = buildCommercialOperationUniverseQuery({ ...baseInput, temporal_axis: 'SALE_INVOICE' });
  const where = sql.slice(sql.indexOf('WHERE'));
  assert.match(where, /m\.fecha_factura::date BETWEEN DATE '2026-08-01' AND DATE '2026-08-31'/);
  assert.doesNotMatch(where, /crm_created_at::date BETWEEN/);
  assert.doesNotMatch(where, /forum_fecha_cotizacion::date BETWEEN/);
});

test('COHORT uses only cohort axis and does not date-filter linked CRM or VIN', () => {
  const sql = buildCommercialOperationUniverseQuery({ ...baseInput, temporal_mode: 'COHORT', temporal_axis: 'FORUM_COTIZACION' });
  const where = sql.slice(sql.indexOf('WHERE'));
  assert.match(where, /forum_fecha_cotizacion::date BETWEEN/);
  assert.doesNotMatch(where, /crm_created_at::date BETWEEN/);
  assert.doesNotMatch(where, /fecha_factura::date BETWEEN/);
});

test('certified bridge is preserved when CRM is earlier than Forum and invoice is earlier than CRM', () => {
  const linked = forumCrm(1, '10', 'VIN10');
  const out = assembleCommercialOperationUniverse([linked], baseInput);
  assert.equal(out.intersections.forum_with_crm, 1);
  assert.equal(out.intersections.forum_with_vin, 1);
  assert.equal(out.counts.vin_sales, 1);
});

for (const [name, field, value] of [
  ['sucursal', 'sucursal_ids', 1], ['persona', 'persona_ids', 10], ['marca', 'marca_ids', 100], ['modelo', 'modelo_ids', 1000],
]) {
  test(`canonical ${name} filter uses consensus ID`, () => {
    const out = assembleCommercialOperationUniverse([forumOnly(1), forumOnly(2)], {
      ...baseInput, scope: { ...baseInput.scope, [field]: [value] },
    });
    assert.equal(out.counts.observable_operations, 2);
  });
}

test('OWN_STORES SQL requires resolved consensus store classified CIDEF', () => {
  const sql = buildCommercialOperationUniverseQuery({ ...baseInput, scope: { ...baseInput.scope, organization_scope: 'OWN_STORES' } });
  assert.match(sql, /m\.sucursal_id IS NOT NULL AND sm\.tipo_canal='CIDEF'/);
  assert.doesNotMatch(sql, /forum_sucursal_id\s+IS NOT NULL/);
});

test('forum_final_states is a closed canonical filter', () => {
  const sql = buildCommercialOperationUniverseQuery({ ...baseInput, forum_final_states: ['UFIS', 'APROBACION'] });
  assert.match(sql, /m\.forum_estado IN \('UFIS','APROBACION'\)/);
  assert.throws(() => normalizeCommercialOperationUniverseInput({ ...baseInput, forum_final_states: ['CLOSED'] }), /INVALID_COMMERCIAL_OPERATION_UNIVERSE_FORUM_STATE/);
});

test('Forum states expose observed counts only and do not infer transitions', () => {
  const out = assembleCommercialOperationUniverse([forumOnly(1, 'COTIZACION'), forumOnly(2, 'APROBACION'), forumOnly(3, 'UFIS')], baseInput);
  assert.equal(out.forum_states.total_forum_operations, 3);
  assert.equal(out.forum_states.by_final_state.COTIZACION, 1);
  assert.equal(out.forum_states.by_final_state.APROBACION, 1);
  assert.equal(out.forum_states.by_final_state.UFIS, 1);
  assert.equal('approval_to_ufi_rate' in out.rates, false);
});

test('primitive rates carry explicit numerator/denominator and null on zero denominator', () => {
  const out = assembleCommercialOperationUniverse([], baseInput);
  assert.deepEqual(out.rates.forum_crm_match_rate, { numerator: 0, denominator: 0, value: null });
  assert.deepEqual(out.rates.vin_crm_match_rate, { numerator: 0, denominator: 0, value: null });
});

test('all counter and intersection invariants reconcile', () => {
  const rows = [forumOnly(1), forumCrm(2, '20'), forumCrm(3, '30', 'VIN30'), row({ commercial_operation_id: 'CRM:40', crm_deal_id: '40' })];
  const out = assembleCommercialOperationUniverse(rows, baseInput);
  assert.equal(out.validation.operation_ids_unique, true);
  assert.equal(out.validation.forum_count_reconciles, true);
  assert.equal(out.validation.crm_count_reconciles, true);
  assert.equal(out.validation.vin_count_reconciles, true);
  assert.equal(out.validation.forum_intersections_reconcile, true);
  assert.equal(out.validation.crm_intersections_reconcile, true);
  assert.equal(out.validation.forum_crm_status_reconciles, true);
  assert.equal(out.validation.valid, true);
});

test('analytical_events omit customer/raw identity fields', () => {
  const event = assembleCommercialOperationUniverse([forumCrm(1, '10', 'VIN10')], baseInput).analytical_events[0];
  for (const forbidden of ['rut_normalizado','nombre_cliente','raw_seller','raw_store','raw_product','forum_marca_id','crm_marca_id']) {
    assert.equal(forbidden in event, false);
  }
  assert.equal(event.commercial_operation_id, 'FORUM:1');
  assert.equal(event.vin, 'VIN10');
});

test('runtime builder is on-demand and testable with injected SQL without persistence', async () => {
  let receivedSql = '';
  const fakeSql = { query: async (sql) => { receivedSql = sql; return [forumOnly(1)]; } };
  const out = await buildCommercialOperationUniverse(baseInput, { sql: fakeSql });
  assert.match(receivedSql, /FROM public\.commercial_operation_master_v01/);
  assert.doesNotMatch(receivedSql, /INSERT|UPDATE|DELETE|CREATE TABLE/i);
  assert.equal(out.counts.forum_operations, 1);
});

test('input contract rejects implicit relative dates, names and unsupported scope', () => {
  assert.throws(() => normalizeCommercialOperationUniverseInput({ ...baseInput, date_from: 'CURRENT_MONTH' }), /INVALID_COMMERCIAL_OPERATION_UNIVERSE_DATE/);
  assert.throws(() => normalizeCommercialOperationUniverseInput({ ...baseInput, scope: { ...baseInput.scope, sucursal_ids: ['PLAZA NORTE'] } }), /INVALID_COMMERCIAL_OPERATION_UNIVERSE_FILTER/);
  assert.throws(() => normalizeCommercialOperationUniverseInput({ ...baseInput, scope: { ...baseInput.scope, organization_scope: 'DEALERS' } }), /INVALID_COMMERCIAL_OPERATION_UNIVERSE_SCOPE/);
});
