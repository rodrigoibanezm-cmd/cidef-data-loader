import { analysisBaseSql } from './geographic-market-base-sql.js';

export function geographicSummarySql(level) {
  return `WITH ${analysisBaseSql(level)}, totals AS (
    SELECT period_key,geography,SUM(units) AS universe_units
    FROM base GROUP BY 1,2), brands AS (
    SELECT period_key,geography,marca,SUM(units) AS brand_units
    FROM base GROUP BY 1,2,3), ranked AS (
    SELECT b.*,t.universe_units,
      ROW_NUMBER() OVER (PARTITION BY b.period_key,b.geography
        ORDER BY b.brand_units DESC,b.marca ASC)::int AS ranking
    FROM brands b JOIN totals t USING(period_key,geography)), selected AS (
    SELECT * FROM ranked WHERE $8::text IS NULL OR marca=$8), missing AS (
    SELECT t.period_key,t.geography,$8::text AS marca,0::numeric AS brand_units,
      t.universe_units,NULL::int AS ranking FROM totals t
    WHERE $8::text IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ranked r
      WHERE r.period_key=t.period_key AND r.geography=t.geography AND r.marca=$8))
  SELECT period_key,geography,marca,brand_units,universe_units,
    ROUND(100*brand_units/NULLIF(universe_units,0),4) AS share_pct,ranking
  FROM (SELECT * FROM selected UNION ALL SELECT * FROM missing) result
  ORDER BY period_key,geography,ranking NULLS LAST,marca`;
}
