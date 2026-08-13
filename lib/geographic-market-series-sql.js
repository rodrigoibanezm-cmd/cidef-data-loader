import { analysisBaseSql } from './geographic-market-base-sql.js';

export function geographicSeriesSql(level) {
  return `WITH ${analysisBaseSql(level)}, current AS (
    SELECT * FROM base WHERE period_key='current'), totals AS (
    SELECT year_month,geography,SUM(units) AS universe_units
    FROM current GROUP BY 1,2), ranked AS (
    SELECT c.*,t.universe_units,ROW_NUMBER() OVER (
      PARTITION BY c.year_month,c.geography
      ORDER BY c.units DESC,c.marca ASC)::int AS ranking
    FROM current c JOIN totals t USING(year_month,geography)), selected AS (
    SELECT year_month,geography,marca,units,universe_units,ranking
    FROM ranked WHERE $8::text IS NULL OR marca=$8), missing AS (
    SELECT t.year_month,t.geography,$8::text AS marca,0::numeric AS units,
      t.universe_units,NULL::int AS ranking FROM totals t
    WHERE $8::text IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ranked r
      WHERE r.year_month=t.year_month AND r.geography=t.geography AND r.marca=$8))
  SELECT year_month,geography,marca,units AS brand_units,universe_units,
    ROUND(100*units/NULLIF(universe_units,0),4) AS share_pct,ranking
  FROM (SELECT * FROM selected UNION ALL SELECT * FROM missing) result
  ORDER BY year_month,geography,ranking NULLS LAST,marca`;
}
