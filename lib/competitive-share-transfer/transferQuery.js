import { customGptDb } from '../custom-gpt/db.js';
import {
  buildPreliminarySnapshotInventoryQuery,
  buildRvmUniverseCtes,
  parseRvmUniverseInput,
} from '../rvm-universe/buildRvmUniverse.js';

function iso(date) { return date.toISOString().slice(0, 10); }
function shiftYears(value, years) {
  const source = new Date(`${value}T00:00:00.000Z`);
  const targetYear = source.getUTCFullYear() + years;
  const month = source.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(targetYear, month, Math.min(source.getUTCDate(), lastDay))));
}
function shiftMonths(value, months) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return iso(date);
}
function monthStart(value) { return `${value.slice(0, 7)}-01`; }

export function historicalQueryRange(parsed) {
  return {
    dateFrom: parsed.temporalBasis === 'ROLLING_12'
      ? shiftMonths(parsed.dateFrom, -23) : shiftYears(parsed.dateFrom, -1),
    dateTo: parsed.dateTo,
  };
}

export function currentMtdRanges(dateCutoff) {
  const currentFrom = monthStart(dateCutoff);
  const comparisonTo = shiftYears(dateCutoff, -1);
  return {
    current: { dateFrom: currentFrom, dateTo: dateCutoff },
    comparison: { dateFrom: monthStart(comparisonTo), dateTo: comparisonTo },
  };
}

export function buildTransferAggregateQuery({ dateFrom, dateTo, dataStatus, snapshotDate = null }) {
  const universe = parseRvmUniverseInput({
    date_from: dateFrom,
    date_to: dateTo,
    organization_scope: 'CIDEF',
    data_status: dataStatus,
    ...(snapshotDate ? { snapshot_date: snapshotDate } : {}),
  });
  const { ctes, params, relation } = buildRvmUniverseCtes(universe, []);
  return {
    sql: `WITH ${ctes}
SELECT to_char(date_trunc('month',u.fecha),'YYYY-MM') AS month,
       u.raw_brand_norm,u.scope_brand_id,u.brand_name,u.model_id,u.model_name,u.identity_status,
       u.organization_bucket,u.organization_resolution_method,
       u.brand_aggregate_organization_bucket,u.brand_aggregate_resolution_method,
       u.segment_key,u.type_key,u.fuel_key,
       u.brand_origin_group,u.brand_origin_country,u.brand_origin_source,
       u.data_status,u.snapshot_date::text AS snapshot_date,
       sum(coalesce(u.cantidad,0))::numeric AS units
FROM ${relation} u
GROUP BY date_trunc('month',u.fecha),u.raw_brand_norm,u.scope_brand_id,u.brand_name,
         u.model_id,u.model_name,u.identity_status,u.organization_bucket,u.organization_resolution_method,
         u.brand_aggregate_organization_bucket,u.brand_aggregate_resolution_method,
         u.segment_key,u.type_key,u.fuel_key,u.brand_origin_group,u.brand_origin_country,
         u.brand_origin_source,u.data_status,u.snapshot_date
ORDER BY month,u.scope_brand_id,u.model_id,u.raw_brand_norm`,
    params,
  };
}

export async function fetchTransferRows(spec, query = customGptDb().query) {
  const built = buildTransferAggregateQuery(spec);
  return query(built.sql, built.params);
}

export async function fetchPreliminarySnapshotInventory(dateFrom, dateTo, query = customGptDb().query) {
  const built = buildPreliminarySnapshotInventoryQuery({ dateFrom, dateTo });
  return query(built.sql, built.params);
}
