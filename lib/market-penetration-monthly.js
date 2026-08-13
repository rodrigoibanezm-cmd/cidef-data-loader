import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

export async function refreshMarketPenetrationMonthly() {
  const sql = db();
  await sql.query(`
    CREATE TABLE IF NOT EXISTS market_penetration_monthly (
      periodo date NOT NULL,
      universe_origin text NOT NULL,
      marca text NOT NULL,
      segmento text NOT NULL,
      unidades_marca numeric NOT NULL,
      unidades_universo numeric NOT NULL,
      penetracion_pct numeric NOT NULL,
      refreshed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (periodo, universe_origin, marca, segmento)
    )
  `);

  await sql.query(`TRUNCATE market_penetration_monthly`);
  await sql.query(`
    WITH base AS (
      SELECT date_trunc('month', r.fecha)::date AS periodo,
             b.marca, b.origen_marca,
             CASE WHEN r.descripcion_segmento='CAMIONETA' THEN 'PICK-UP'
                  ELSE r.descripcion_segmento END AS segmento,
             r.cantidad::numeric AS cantidad
      FROM rvm_raw r
      JOIN brands_master b ON b.marca=r.marca
      WHERE r.fecha IS NOT NULL
    ), universes AS (
      SELECT periodo, 'ALL'::text AS universe_origin, marca, segmento, cantidad FROM base
      UNION ALL
      SELECT periodo, origen_marca, marca, segmento, cantidad FROM base
      WHERE origen_marca IS NOT NULL AND origen_marca <> 'PENDIENTE'
    ), expanded AS (
      SELECT periodo, universe_origin, marca, segmento, cantidad FROM universes
      UNION ALL
      SELECT periodo, universe_origin, marca, 'TOTAL', cantidad FROM universes
    ), market AS (
      SELECT periodo, universe_origin, segmento, SUM(cantidad) AS unidades_universo
      FROM expanded GROUP BY 1,2,3
    ), brand AS (
      SELECT periodo, universe_origin, marca, segmento, SUM(cantidad) AS unidades_marca
      FROM expanded GROUP BY 1,2,3,4
    )
    INSERT INTO market_penetration_monthly
      (periodo, universe_origin, marca, segmento, unidades_marca, unidades_universo, penetracion_pct, refreshed_at)
    SELECT b.periodo, b.universe_origin, b.marca, b.segmento,
           b.unidades_marca, m.unidades_universo,
           ROUND(100*b.unidades_marca/NULLIF(m.unidades_universo,0),4), now()
    FROM brand b
    JOIN market m USING (periodo, universe_origin, segmento)
  `);

  const [r] = await sql.query(`
    SELECT COUNT(*)::int AS rows, MIN(periodo) AS desde, MAX(periodo) AS hasta
    FROM market_penetration_monthly
  `);
  return r;
}
