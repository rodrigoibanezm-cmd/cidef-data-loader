import { customGptDb } from '../custom-gpt/db.js';
import {
  assembleRvmUniverse, buildRvmUniverseCtes, parseRvmUniverseInput,
} from '../rvm-universe/buildRvmUniverse.js';

export function buildGrowthRvmQuery(input) {
  const parsed = parseRvmUniverseInput(input);
  const { ctes, params, relation } = buildRvmUniverseCtes(parsed, []);
  return {
    parsed,
    params,
    sql: `WITH ${ctes}
SELECT u.fecha::text AS fecha,u.scope_brand_id,u.brand_name,u.model_id,u.model_name,
       u.identity_status,u.organization_bucket,
       u.brand_origin_group,u.brand_origin_country,u.brand_origin_source,
       u.data_status,u.snapshot_date::text AS snapshot_date,
       sum(coalesce(u.cantidad,0))::numeric AS cantidad
FROM ${relation} u
GROUP BY u.fecha,u.scope_brand_id,u.brand_name,u.model_id,u.model_name,u.identity_status,
         u.organization_bucket,
         u.brand_origin_group,u.brand_origin_country,u.brand_origin_source,u.data_status,u.snapshot_date
ORDER BY u.fecha,u.scope_brand_id,u.model_id`,
  };
}

export async function fetchGrowthRvmUniverse(input, query = customGptDb().query) {
  const built = buildGrowthRvmQuery(input);
  const rows = await query(built.sql, built.params);
  return assembleRvmUniverse(built.parsed, rows);
}
