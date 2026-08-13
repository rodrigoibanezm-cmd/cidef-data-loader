import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

export async function run(input = {}) {
  const brands = Array.isArray(input.brands)
    ? input.brands.map(v => String(v).trim().toUpperCase()).filter(Boolean)
    : [];
  const universeOrigin = input.universe_origin
    ? String(input.universe_origin).trim().toUpperCase()
    : 'ALL';
  const periodo = input.periodo ? String(input.periodo).trim() : null;
  const sql = db();

  const [latest] = await sql.query(`
    SELECT COALESCE($1::date, MAX(periodo)) AS periodo
    FROM market_penetration_monthly
    WHERE universe_origin=$2
  `, [periodo ? `${periodo}-01` : null, universeOrigin]);
  if (!latest?.periodo) throw new Error('market_penetration_monthly is empty; run refresh_market_penetration_monthly');

  const rows = await sql.query(`
    SELECT marca,
           MAX(unidades_marca) FILTER (WHERE segmento='TOTAL') AS unidades_marca,
           MAX(unidades_universo) FILTER (WHERE segmento='TOTAL') AS unidades_universo,
           MAX(penetracion_pct) FILTER (WHERE segmento='TOTAL') AS penetracion_total_pct,
           COALESCE(json_agg(json_build_object(
             'segmento', segmento,
             'unidades_marca', unidades_marca,
             'unidades_universo', unidades_universo,
             'penetracion_pct', penetracion_pct
           ) ORDER BY segmento) FILTER (WHERE segmento <> 'TOTAL'), '[]'::json) AS segmentos
    FROM market_penetration_monthly
    WHERE periodo=$1::date
      AND universe_origin=$2
      AND (cardinality($3::text[])=0 OR marca=ANY($3::text[]))
    GROUP BY marca
    ORDER BY unidades_marca DESC
  `, [latest.periodo, universeOrigin, brands]);

  return { periodo: latest.periodo, universe_origin: universeOrigin, brands_filter: brands, rows };
}
