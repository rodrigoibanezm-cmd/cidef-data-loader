import { customGptDb } from '../custom-gpt/db.js';

export const UNIVERSE_NAME = 'commercial_operation_universe_v01';
export const UNIVERSE_VERSION = '0.1';

const TEMPORAL_MODES = Object.freeze(['PERIOD', 'COHORT']);
const TEMPORAL_AXIS = Object.freeze({
  FORUM_COTIZACION: 'forum_fecha_cotizacion',
  CRM_CREATED: 'crm_created_at',
  CRM_ASSIGNED: 'crm_assigned_at',
  SALE_INVOICE: 'fecha_factura',
});
const ORGANIZATION_SCOPES = Object.freeze(['COMPANY', 'OWN_STORES']);
const FORUM_FINAL_STATES = Object.freeze(['COTIZACION', 'SOLICITUD', 'APROBACION', 'RECHAZO', 'UFIS']);
const ID_FILTERS = Object.freeze({
  sucursal: { input: 'sucursal_ids', canonical: 'sucursal_id', sources: ['forum_sucursal_id', 'crm_sucursal_id', 'vin_sucursal_id'] },
  persona: { input: 'persona_ids', canonical: 'persona_id', sources: ['forum_persona_id', 'crm_persona_id'] },
  marca: { input: 'marca_ids', canonical: 'marca_id', sources: ['forum_marca_id', 'crm_marca_id', 'vin_marca_id'] },
  modelo: { input: 'modelo_ids', canonical: 'modelo_id', sources: ['forum_modelo_id', 'crm_modelo_id', 'vin_modelo_id'] },
});

function invalid(code, detail) {
  const error = new Error(`${code}${detail ? `: ${detail}` : ''}`);
  error.code = code;
  throw error;
}

function normalizeDate(value, field) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) invalid('INVALID_COMMERCIAL_OPERATION_UNIVERSE_DATE', field);
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== text) invalid('INVALID_COMMERCIAL_OPERATION_UNIVERSE_DATE', field);
  return text;
}

function normalizeIds(value, field) {
  if (value == null) return [];
  if (!Array.isArray(value)) invalid('INVALID_COMMERCIAL_OPERATION_UNIVERSE_FILTER', field);
  const ids = value.map((item) => Number(item));
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) invalid('INVALID_COMMERCIAL_OPERATION_UNIVERSE_FILTER', field);
  return [...new Set(ids)];
}

function normalizeStates(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) invalid('INVALID_COMMERCIAL_OPERATION_UNIVERSE_FORUM_STATE', 'forum_final_states');
  const states = [...new Set(value.map((item) => String(item).trim().toUpperCase()).filter(Boolean))];
  const unsupported = states.filter((state) => !FORUM_FINAL_STATES.includes(state));
  if (unsupported.length) invalid('INVALID_COMMERCIAL_OPERATION_UNIVERSE_FORUM_STATE', unsupported.join(','));
  return states;
}

export function normalizeCommercialOperationUniverseInput(input = {}) {
  const temporalMode = String(input.temporal_mode ?? '').trim().toUpperCase();
  const temporalAxis = String(input.temporal_axis ?? '').trim().toUpperCase();
  if (!TEMPORAL_MODES.includes(temporalMode)) invalid('INVALID_COMMERCIAL_OPERATION_UNIVERSE_TEMPORAL_MODE', temporalMode || 'missing');
  if (!TEMPORAL_AXIS[temporalAxis]) invalid('INVALID_COMMERCIAL_OPERATION_UNIVERSE_TEMPORAL_AXIS', temporalAxis || 'missing');
  const dateFrom = normalizeDate(input.date_from, 'date_from');
  const dateTo = normalizeDate(input.date_to, 'date_to');
  if (dateFrom > dateTo) invalid('INVALID_COMMERCIAL_OPERATION_UNIVERSE_PERIOD', `${dateFrom}>${dateTo}`);
  const scope = input.scope ?? {};
  const organizationScope = String(scope.organization_scope ?? 'COMPANY').trim().toUpperCase();
  if (!ORGANIZATION_SCOPES.includes(organizationScope)) invalid('INVALID_COMMERCIAL_OPERATION_UNIVERSE_SCOPE', organizationScope);
  return {
    temporal_mode: temporalMode,
    temporal_axis: temporalAxis,
    date_from: dateFrom,
    date_to: dateTo,
    scope: {
      organization_scope: organizationScope,
      sucursal_ids: normalizeIds(scope.sucursal_ids, 'sucursal_ids'),
      persona_ids: normalizeIds(scope.persona_ids, 'persona_ids'),
      marca_ids: normalizeIds(scope.marca_ids, 'marca_ids'),
      modelo_ids: normalizeIds(scope.modelo_ids, 'modelo_ids'),
    },
    forum_final_states: normalizeStates(input.forum_final_states),
  };
}

function quoteDate(value) {
  return `DATE '${value}'`;
}

function sqlList(values) {
  return values.map((value) => Number(value)).join(',');
}

export function buildCommercialOperationUniverseQuery(input = {}) {
  const selection = normalizeCommercialOperationUniverseInput(input);
  const axisColumn = TEMPORAL_AXIS[selection.temporal_axis];
  const clauses = [
    `m.${axisColumn}::date BETWEEN ${quoteDate(selection.date_from)} AND ${quoteDate(selection.date_to)}`,
  ];
  if (selection.scope.organization_scope === 'OWN_STORES') clauses.push(`m.sucursal_id IS NOT NULL AND sm.tipo_canal='CIDEF'`);
  if (selection.forum_final_states.length) {
    clauses.push(`m.forum_estado IN (${selection.forum_final_states.map((state) => `'${state}'`).join(',')})`);
  }
  return `SELECT
    m.commercial_operation_id,m.operation_status,
    m.forum_numero_operacion,m.crm_deal_id,m.vin,
    m.sucursal_id,m.persona_id,m.marca_id,m.modelo_id,
    m.forum_sucursal_id,m.crm_sucursal_id,m.vin_sucursal_id,
    m.forum_persona_id,m.crm_persona_id,
    m.forum_marca_id,m.crm_marca_id,m.vin_marca_id,
    m.forum_modelo_id,m.crm_modelo_id,m.vin_modelo_id,
    m.forum_fecha_cotizacion,m.crm_created_at,m.crm_assigned_at,m.fecha_factura,
    m.forum_estado AS forum_final_state,
    m.forum_present,m.crm_present,m.vin_present,
    m.forum_crm_match_status,m.crm_vin_match_status,m.identity_status,
    m.crm_forum_match_count,
    sm.tipo_canal
  FROM public.commercial_operation_master_v01 m
  LEFT JOIN public.sucursales_master sm ON sm.sucursal_id=m.sucursal_id
  WHERE ${clauses.join('\n    AND ')}
  ORDER BY m.commercial_operation_id`;
}

function nonNullSet(rows, field) {
  return new Set(rows.map((row) => row[field]).filter((value) => value != null && String(value).trim() !== '').map(String));
}

function distinctCount(rows, field) {
  return nonNullSet(rows, field).size;
}

function sourceConflict(row, sourceFields) {
  return nonNullSet([row], sourceFields[0]).size > 1;
}

function sourceValues(row, fields) {
  return [...new Set(fields.map((field) => row[field]).filter((value) => value != null).map((value) => Number(value)))];
}

function dimensionConflict(row, fields) {
  return sourceValues(row, fields).length > 1;
}

function matchesRequestedDimensions(row, selection) {
  return Object.values(ID_FILTERS).every(({ input, canonical }) => {
    const requested = selection.scope[input];
    return !requested.length || (row[canonical] != null && requested.includes(Number(row[canonical])));
  });
}

function excludedByRequestedDimension(rows, selection) {
  const result = { sucursal: 0, persona: 0, marca: 0, modelo: 0 };
  for (const [name, config] of Object.entries(ID_FILTERS)) {
    const requested = selection.scope[config.input];
    if (!requested.length) continue;
    for (const row of rows) {
      if (row[config.canonical] != null) continue;
      if (!dimensionConflict(row, config.sources)) continue;
      if (!sourceValues(row, config.sources).some((id) => requested.includes(id))) continue;
      result[name]++;
    }
  }
  return result;
}

function metricRate(numerator, denominator) {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

function forumDistinct(rows, predicate = () => true) {
  return distinctCount(rows.filter((row) => row.forum_numero_operacion != null && predicate(row)), 'forum_numero_operacion');
}
function crmDistinct(rows, predicate = () => true) {
  return distinctCount(rows.filter((row) => row.crm_deal_id != null && predicate(row)), 'crm_deal_id');
}
function vinDistinct(rows, predicate = () => true) {
  return distinctCount(rows.filter((row) => row.vin != null && predicate(row)), 'vin');
}

function byIdentityStatus(rows) {
  const count = (value) => rows.filter((row) => row.identity_status === value).length;
  return {
    consistent: count('CONSISTENT'),
    single_source: count('SINGLE_SOURCE'),
    source_conflict: count('SOURCE_CONFLICT'),
    many_forum_to_one_crm: count('MANY_FORUM_TO_ONE_CRM'),
  };
}

function forumStateCounts(rows) {
  const out = {};
  for (const state of FORUM_FINAL_STATES) out[state] = forumDistinct(rows, (row) => row.forum_final_state === state);
  return out;
}

function analyticalEvent(row) {
  return {
    commercial_operation_id: row.commercial_operation_id,
    forum_numero_operacion: row.forum_numero_operacion ?? null,
    crm_deal_id: row.crm_deal_id ?? null,
    vin: row.vin ?? null,
    sucursal_id: row.sucursal_id ?? null,
    persona_id: row.persona_id ?? null,
    marca_id: row.marca_id ?? null,
    modelo_id: row.modelo_id ?? null,
    forum_fecha_cotizacion: row.forum_fecha_cotizacion ?? null,
    crm_created_at: row.crm_created_at ?? null,
    crm_assigned_at: row.crm_assigned_at ?? null,
    fecha_factura: row.fecha_factura ?? null,
    forum_final_state: row.forum_final_state ?? null,
    forum_present: row.forum_present === true,
    crm_present: row.crm_present === true,
    vin_present: row.vin_present === true,
    forum_crm_match_status: row.forum_crm_match_status ?? null,
    crm_vin_match_status: row.crm_vin_match_status ?? null,
    identity_status: row.identity_status ?? null,
  };
}

export function assembleCommercialOperationUniverse(rows, input = {}) {
  const selection = normalizeCommercialOperationUniverseInput(input);
  const eligibleRows = rows ?? [];
  const excludedByDimension = excludedByRequestedDimension(eligibleRows, selection);
  const selected = eligibleRows.filter((row) => matchesRequestedDimensions(row, selection));

  const counts = {
    observable_operations: selected.length,
    forum_operations: forumDistinct(selected),
    crm_deals: crmDistinct(selected),
    vin_sales: vinDistinct(selected),
  };

  const intersections = {
    forum_with_crm: forumDistinct(selected, (row) => row.crm_deal_id != null),
    forum_without_crm: forumDistinct(selected, (row) => row.crm_deal_id == null),
    forum_with_vin: forumDistinct(selected, (row) => row.vin != null),
    crm_with_forum: crmDistinct(selected, (row) => row.forum_numero_operacion != null),
    crm_without_forum: crmDistinct(selected, (row) => row.forum_numero_operacion == null),
    crm_with_vin: crmDistinct(selected, (row) => row.vin != null),
    vin_with_forum: vinDistinct(selected, (row) => row.forum_numero_operacion != null),
    vin_with_crm: vinDistinct(selected, (row) => row.crm_deal_id != null),
  };

  const rates = {
    forum_crm_match_rate: metricRate(intersections.forum_with_crm, counts.forum_operations),
    forum_vin_match_rate: metricRate(intersections.forum_with_vin, counts.forum_operations),
    crm_forum_match_rate: metricRate(intersections.crm_with_forum, counts.crm_deals),
    crm_vin_match_rate: metricRate(intersections.crm_with_vin, counts.crm_deals),
    vin_forum_match_rate: metricRate(intersections.vin_with_forum, counts.vin_sales),
    vin_crm_match_rate: metricRate(intersections.vin_with_crm, counts.vin_sales),
  };

  const forumStates = {
    total_forum_operations: counts.forum_operations,
    by_final_state: forumStateCounts(selected),
  };

  const reconciliation = {
    forum_crm: {
      matched: forumDistinct(selected, (row) => row.forum_crm_match_status === 'MATCHED'),
      ambiguous: forumDistinct(selected, (row) => row.forum_crm_match_status === 'AMBIGUOUS'),
      unmatched: forumDistinct(selected, (row) => row.forum_crm_match_status === 'UNMATCHED'),
    },
    crm_vin: {
      matched: crmDistinct(selected, (row) => row.vin != null),
      unmatched: crmDistinct(selected, (row) => row.vin == null),
    },
    many_forum_to_one_crm: {
      rows: selected.filter((row) => row.identity_status === 'MANY_FORUM_TO_ONE_CRM').length,
      crm_deals: crmDistinct(selected, (row) => row.identity_status === 'MANY_FORUM_TO_ONE_CRM'),
    },
  };

  const identityQuality = {
    ...byIdentityStatus(selected),
    excluded_by_requested_dimension: excludedByDimension,
  };

  const coverage = {
    forum: { operations: counts.forum_operations, with_crm: intersections.forum_with_crm, with_vin: intersections.forum_with_vin },
    crm: { deals: counts.crm_deals, with_forum: intersections.crm_with_forum, with_vin: intersections.crm_with_vin },
    sales: { vin: counts.vin_sales, with_crm: intersections.vin_with_crm, with_forum: intersections.vin_with_forum },
  };

  const limitations = ['FORUM_NOT_EXHAUSTIVE', 'FORUM_STATE_HISTORY_UNAVAILABLE'];
  if (identityQuality.source_conflict > 0 || Object.values(excludedByDimension).some((value) => value > 0)) limitations.push('IDENTITY_CONFLICTS_PRESENT');
  if (reconciliation.forum_crm.ambiguous > 0) limitations.push('AMBIGUOUS_FORUM_CRM_MATCHES_PRESENT');

  const operationIds = selected.map((row) => row.commercial_operation_id);
  const forumStateTotal = Object.values(forumStates.by_final_state).reduce((sum, value) => sum + value, 0);
  const noForcedIdentityResolution = eligibleRows.every((row) => Object.values(ID_FILTERS).every((config) => !dimensionConflict(row, config.sources) || row[config.canonical] == null));
  const validation = {
    operation_ids_unique: new Set(operationIds).size === operationIds.length,
    forum_count_reconciles: counts.forum_operations === forumDistinct(selected),
    crm_count_reconciles: counts.crm_deals === crmDistinct(selected),
    vin_count_reconciles: counts.vin_sales === vinDistinct(selected),
    forum_intersections_reconcile: intersections.forum_with_crm + intersections.forum_without_crm === counts.forum_operations,
    crm_intersections_reconcile: intersections.crm_with_forum + intersections.crm_without_forum === counts.crm_deals,
    forum_crm_status_reconciles: reconciliation.forum_crm.matched + reconciliation.forum_crm.ambiguous + reconciliation.forum_crm.unmatched === counts.forum_operations,
    forum_states_reconcile: forumStateTotal === counts.forum_operations,
    vin_forum_subset: intersections.vin_with_forum <= counts.vin_sales,
    vin_crm_subset: intersections.vin_with_crm <= counts.vin_sales,
    cohort_axis_valid: selection.temporal_mode !== 'COHORT' || Boolean(TEMPORAL_AXIS[selection.temporal_axis]),
    period_valid: selection.date_from <= selection.date_to,
    no_forced_identity_resolution: noForcedIdentityResolution,
  };
  validation.valid = Object.values(validation).every((value) => value === true);

  return {
    universe: UNIVERSE_NAME,
    version: UNIVERSE_VERSION,
    selection,
    counts,
    intersections,
    rates,
    forum_states: forumStates,
    reconciliation,
    identity_quality: identityQuality,
    coverage,
    limitations,
    validation,
    analytical_events: selected.map(analyticalEvent),
  };
}

export async function buildCommercialOperationUniverse(input = {}, options = {}) {
  const selection = normalizeCommercialOperationUniverseInput(input);
  const sql = options.sql || customGptDb();
  const rows = await sql.query(buildCommercialOperationUniverseQuery(selection));
  return assembleCommercialOperationUniverse(rows, selection);
}

export const __test = {
  TEMPORAL_MODES,
  TEMPORAL_AXIS,
  ORGANIZATION_SCOPES,
  FORUM_FINAL_STATES,
  ID_FILTERS,
  dimensionConflict,
  matchesRequestedDimensions,
  metricRate,
};
