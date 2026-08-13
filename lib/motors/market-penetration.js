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
    : null;

  const sql = db();
  const rows = await sql.query(`
    WITH base AS (
      SELECT
        b.marca,
        b.origen_marca,
        CASE
          WHEN r.descripcion_segmento = 'CAMIONETA' THEN 'PICK-UP'
          ELSE r.descripcion_segmento
        END AS segmento,
        r.cantidad
      FROM rvm_raw r
      JOIN brands_master b ON b.marca = r.marca
      WHERE ($1::text IS NULL OR b.origen_marca = $1)
    ),
    total_market AS (
      SELECT SUM(cantidad)::numeric AS unidades FROM base
    ),
    total_brand AS (
      SELECT marca, SUM(cantidad)::numeric AS unidades
      FROM base
      WHERE (cardinality($2::text[]) = 0 OR marca = ANY($2::text[]))
      GROUP BY marca
    ),
    segment_market AS (
      SELECT segmento, SUM(cantidad)::numeric AS unidades
      FROM base
      GROUP BY segmento
    ),
    segment_brand AS (
      SELECT marca, segmento, SUM(cantidad)::numeric AS unidades
      FROM base
      WHERE (cardinality($2::text[]) = 0 OR marca = ANY($2::text[]))
      GROUP BY marca, segmento
    )
    SELECT
      tb.marca,
      tb.unidades AS unidades_marca,
      tm.unidades AS unidades_universo,
      ROUND(100 * tb.unidades / NULLIF(tm.unidades, 0), 4) AS penetracion_total_pct,
      COALESCE((
        SELECT json_agg(json_build_object(
          'segmento', sb.segmento,
          'unidades_marca', sb.unidades,
          'unidades_universo', sm.unidades,
          'penetracion_pct', ROUND(100 * sb.unidades / NULLIF(sm.unidades, 0), 4)
        ) ORDER BY sb.segmento)
        FROM segment_brand sb
        JOIN segment_market sm USING (segmento)
        WHERE sb.marca = tb.marca
      ), '[]'::json) AS segmentos
    FROM total_brand tb
    CROSS JOIN total_market tm
    ORDER BY tb.unidades DESC
  `, [universeOrigin, brands]);

  return {
    universe_origin: universeOrigin || 'ALL',
    brands_filter: brands,
    rows,
  };
}
