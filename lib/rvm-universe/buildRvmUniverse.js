import { customGptDb } from '../custom-gpt/db.js';
import {
  parseCutoff, parseDateRange, parseFilterObject, toIsoDate,
} from '../longitudinal/common.js';
import { rvmIdentityResolutionCte, rvmModelAliasCtes } from '../rvm/rvmIdentitySql.js';
import {
  parseOrganizationScope,
  rvmOrganizationResolutionCtes,
} from '../rvm/rvmOrganizationScopeSql.js';

export const UNIVERSE_NAME = 'rvm_universe_v01';
export const UNIVERSE_VERSION = '0.1';

export const RVM_UNIVERSE_FILTERS = new Set([
  'brand_id', 'brand', 'model_id', 'model', 'segment', 'type', 'region', 'comuna',
  'fuel', 'origin',
]);

const DATA_STATUSES = new Set(['CONSOLIDATED', 'PRELIMINARY']);

function add(params, value) {
  params.push(value);
  return `$${params.length}`;
}

function filterPredicates(filters, params, alias = 'r') {
  const columns = {
    brand_id: `${alias}.scope_brand_id::text`,
    brand: `${alias}.brand_name`,
    model_id: `${alias}.model_id::text`,
    model: `${alias}.model_name`,
    segment: `${alias}.descripcion_segmento`,
    type: `${alias}.descripcion_tipo`,
    region: `${alias}.region`,
    comuna: `${alias}.comuna_adquisicion`,
    fuel: `${alias}.combustible`,
    origin: `${alias}.pais_vin`,
  };
  return Object.entries(filters).map(([key, values]) => {
    const parameter = add(params, values);
    return key.endsWith('_id')
      ? `${columns[key]} = ANY(${parameter}::text[])`
      : `master_norm(${columns[key]}) = ANY(ARRAY(SELECT master_norm(v) FROM unnest(${parameter}::text[]) v))`;
  });
}

export function parseRvmUniverseInput(input = {}) {
  const { dateFrom, dateTo } = parseDateRange(input);
  const organizationScope = parseOrganizationScope(input.organization_scope);
  const filters = parseFilterObject(
    input.universe_filters ?? input.filters,
    RVM_UNIVERSE_FILTERS,
  );
  const dataStatus = String(input.data_status || 'CONSOLIDATED').trim().toUpperCase();
  if (!DATA_STATUSES.has(dataStatus)) throw new Error('INVALID_RVM_DATA_STATUS');
  const snapshotDate = input.snapshot_date == null || input.snapshot_date === ''
    ? null : String(input.snapshot_date);
  if (snapshotDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    throw new Error('INVALID_RVM_SNAPSHOT_DATE');
  }
  if (dataStatus === 'CONSOLIDATED' && snapshotDate != null) {
    throw new Error('SNAPSHOT_DATE_ONLY_VALID_FOR_PRELIMINARY');
  }
  return {
    dateFrom, dateTo, organizationScope, filters, dataStatus, snapshotDate, ...parseCutoff(input),
  };
}

/**
 * Certified runtime relation. Consumers compose this CTE and calculate only over
 * rvm_universe_v01; RAW and MASTER resolution remain confined to this module.
 */
export function buildRvmUniverseCtes(parsed, params = []) {
  const dateFrom = add(params, parsed.dateFrom);
  const dateTo = add(params, parsed.dateTo);
  const organizationParam = parsed.organizationScope === 'ALL'
    ? null
    : add(params, parsed.organizationScope);
  const dataStatus = add(params, parsed.dataStatus ?? 'CONSOLIDATED');
  const snapshotPredicate = parsed.snapshotDate == null
    ? '' : ` AND r.snapshot_date=${add(params, parsed.snapshotDate)}::date`;
  const predicates = filterPredicates(parsed.filters ?? {}, params, 'u');

  const ctes = `rvm_scoped AS MATERIALIZED (
    SELECT row_number() OVER ()::bigint AS _rvm_scope_row_id,r.*,
      master_norm(r.marca) AS raw_brand_norm,
      master_norm(r.modelo_homologado) AS raw_model_norm,
      master_norm(r.modeo_version) AS raw_version_norm
    FROM rvm_raw r
    WHERE r.fecha BETWEEN ${dateFrom}::date AND ${dateTo}::date
      AND r.data_status=${dataStatus}::text${snapshotPredicate}
  ),
  ${rvmModelAliasCtes()},
  ${rvmIdentityResolutionCte()},
  ${rvmOrganizationResolutionCtes({
    organizationScope: parsed.organizationScope,
    organizationParam,
  })},
  rvm_universe_resolved AS MATERIALIZED (
    SELECT r.*,
      r.marca AS raw_brand,
      r.modelo_homologado AS raw_model,
      r.modeo_version AS raw_version,
      ma.nombre_canonico AS brand_name,
      ma.origin_group AS brand_origin_group,
      ma.pais_origen_marca AS brand_origin_country,
      ma.origin_source AS brand_origin_source,
      mo.nombre_canonico AS model_name,
      r.pais_vin AS origin,
      master_norm(r.descripcion_segmento) AS segment_key,
      master_norm(r.descripcion_tipo) AS type_key,
      master_norm(r.region) AS region_key,
      master_norm(r.comuna_adquisicion) AS comuna_key,
      master_norm(r.combustible) AS fuel_key,
      master_norm(r.pais_vin) AS origin_key,
      extract(year FROM r.fecha)::int AS analytical_year,
      extract(month FROM r.fecha)::int AS analytical_month
    FROM organization_resolution r
    LEFT JOIN marcas_master_v01 ma ON ma.marca_id=r.scope_brand_id
    LEFT JOIN modelos_master_v01 mo ON mo.modelo_id=r.model_id
  ),
  rvm_universe_v01 AS MATERIALIZED (
    SELECT u.* FROM rvm_universe_resolved u${predicates.length ? ` WHERE ${predicates.join(' AND ')}` : ''}
  )`;
  return { ctes, params, relation: UNIVERSE_NAME };
}

export function buildRvmUniverseQuery(parsed) {
  const { ctes, params, relation } = buildRvmUniverseCtes(parsed, []);
  return {
    sql: `WITH ${ctes}\nSELECT * FROM ${relation} ORDER BY fecha,_rvm_scope_row_id`,
    params,
  };
}

function units(rows, predicate = () => true) {
  return rows.reduce((sum, row) => sum + (predicate(row) ? Number(row.cantidad || 0) : 0), 0);
}

export function assembleRvmUniverse(parsed, analyticalEvents) {
  const identity = {
    resolved: units(analyticalEvents, (row) => row.identity_status === 'RESUELTO'),
    unresolved: units(analyticalEvents, (row) => row.identity_status === 'NO_RESUELTO'),
    ambiguous: units(analyticalEvents, (row) => row.identity_status === 'AMBIGUO'),
    total: units(analyticalEvents),
  };
  const organization = {
    included: units(analyticalEvents, (row) => row.organization_bucket === 'INCLUDED'),
    excluded_other_organization: units(analyticalEvents, (row) => row.organization_bucket === 'EXCLUDED_OTHER_ORGANIZATION'),
    unresolved: units(analyticalEvents, (row) => row.organization_bucket === 'UNRESOLVED'),
    ambiguous: units(analyticalEvents, (row) => row.organization_bucket === 'AMBIGUOUS'),
    total: units(analyticalEvents),
  };
  const origin = {
    available: units(analyticalEvents, (row) => row.pais_vin != null && String(row.pais_vin).trim() !== ''),
    unavailable: units(analyticalEvents, (row) => row.pais_vin == null || String(row.pais_vin).trim() === ''),
    total: units(analyticalEvents),
  };
  const dates = analyticalEvents.map((row) => toIsoDate(row.fecha)).filter(Boolean).sort();
  const lastObservedDate = dates.at(-1) ?? null;
  const effectiveCandidates = [parsed.dateTo, parsed.cutoffDate, lastObservedDate].filter(Boolean).sort();
  const effectiveDateTo = lastObservedDate == null ? null : effectiveCandidates[0];
  const identityReconciles = identity.resolved + identity.unresolved + identity.ambiguous === identity.total;
  const organizationReconciles = organization.included + organization.excluded_other_organization
    + organization.unresolved + organization.ambiguous === organization.total;
  const originReconciles = origin.available + origin.unavailable === origin.total;
  const cidefScope = parsed.organizationScope === 'CIDEF';
  return {
    universe: UNIVERSE_NAME,
    version: UNIVERSE_VERSION,
    organization_scope: parsed.organizationScope,
    data_status: parsed.dataStatus,
    snapshot_date: parsed.snapshotDate,
    market_universe_filters: parsed.filters,
    period: {
      requested_date_from: parsed.dateFrom,
      requested_date_to: parsed.dateTo,
      requested_cutoff_date: parsed.cutoffDate,
      effective_date_from: dates[0] ?? null,
      effective_date_to: effectiveDateTo,
      last_observed_date: lastObservedDate,
      cutoff_mode: parsed.cutoffMode,
    },
    analytical_events: analyticalEvents,
    coverage: { product_identity: identity, organization_resolution: organization, origin },
    validation: {
      product_identity_units_reconcile: identityReconciles,
      organization_units_reconcile: organizationReconciles,
      origin_units_reconcile: originReconciles,
      valid: identityReconciles && organizationReconciles && originReconciles,
    },
    warnings: [
      ...(identity.unresolved ? ['PRODUCT_IDENTITY_UNRESOLVED_PRESENT'] : []),
      ...(identity.ambiguous ? ['PRODUCT_IDENTITY_AMBIGUOUS_PRESENT'] : []),
      ...(parsed.organizationScope !== 'ALL' && organization.unresolved
        ? ['ORGANIZATION_SCOPE_PARTIAL'] : []),
      ...(parsed.organizationScope !== 'ALL' && organization.ambiguous
        ? ['ORGANIZATION_SCOPE_AMBIGUOUS'] : []),
      ...(origin.unavailable ? ['ORIGIN_UNAVAILABLE_PRESENT'] : []),
    ],
    lineage: {
      raw_source: 'rvm_raw',
      identity_authority: 'producto_aliases_v01 + modelos_master_v01 + marcas_master_v01',
      organization_authority: cidefScope
        ? 'rvm_raw.marca = DFM'
        : 'product_organization_membership + organizations_master',
      historical_fallback_authority: cidefScope
        ? 'NOT_APPLICABLE'
        : 'rvm_organization_historical_rule',
      historical_aggregate_authority: cidefScope
        ? 'rvm_organization_historical_rule[aggregation_scope=BRAND_AGGREGATE] via brand_aggregate_organization_bucket'
        : 'NOT_APPLICABLE',
      brand_origin_authority: 'marcas_master_v01.origin_group + pais_origen_marca + origin_source',
    },
  };
}

export function buildPreliminarySnapshotInventoryQuery({ dateFrom, dateTo }) {
  return {
    sql: `SELECT snapshot_date::text AS snapshot_date,
                 min(fecha)::text AS min_date,max(fecha)::text AS max_date,
                 count(*)::bigint AS row_count,coalesce(sum(cantidad),0)::numeric AS units
          FROM rvm_raw
          WHERE data_status='PRELIMINARY'
            AND fecha BETWEEN $1::date AND $2::date
          GROUP BY snapshot_date
          ORDER BY snapshot_date`,
    params: [dateFrom, dateTo],
  };
}

export async function buildRvmUniverse(input = {}) {
  const parsed = parseRvmUniverseInput(input);
  const query = buildRvmUniverseQuery(parsed);
  const analyticalEvents = await customGptDb().query(query.sql, query.params);
  return assembleRvmUniverse(parsed, analyticalEvents);
}

export async function buildRvmUniverses(input = {}, organizationScopes = []) {
  const scopes = [...new Set(organizationScopes.map((scope) => parseOrganizationScope(scope)))];
  if (!scopes.length) throw new Error('at least one organization_scope is required');
  const universes = await Promise.all(scopes.map((organizationScope) =>
    buildRvmUniverse({ ...input, organization_scope: organizationScope })));
  return new Map(universes.map((universe) => [universe.organization_scope, universe]));
}
