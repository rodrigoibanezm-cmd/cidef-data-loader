import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

async function refreshTable(sql, table, chinaOnly) {
  await sql.query(`TRUNCATE ${table}`);
  await sql.query(`
    WITH base AS (
      SELECT
        to_char(date_trunc('month', r.fecha), 'YYYY-MM') AS year_month,
        b.marca,
        CASE WHEN r.descripcion_segmento='CAMIONETA' THEN 'PICK-UP'
             ELSE r.descripcion_segmento END AS segmento,
        r.cantidad::numeric AS cantidad
      FROM rvm_raw r
      JOIN brands_master b ON b.marca=r.marca
      WHERE r.fecha IS NOT NULL
        ${chinaOnly ? "AND b.origen_marca='CHINA'" : ''}
    ), expanded AS (
      SELECT year_month, marca, segmento, cantidad FROM base
      UNION ALL
      SELECT year_month, marca, 'TOTAL', cantidad FROM base
    ), market AS (
      SELECT year_month, segmento, SUM(cantidad) AS unidades_universo
      FROM expanded GROUP BY 1,2
    ), brand AS (
      SELECT year_month, marca, segmento, SUM(cantidad) AS unidades_marca
      FROM expanded GROUP BY 1,2,3
    )
    INSERT INTO ${table}
      (year_month, marca, segmento, unidades_marca, unidades_universo, penetracion_pct, refreshed_at)
    SELECT b.year_month, b.marca, b.segmento,
           b.unidades_marca, m.unidades_universo,
           ROUND(100*b.unidades_marca/NULLIF(m.unidades_universo,0),4), now()
    FROM brand b
    JOIN market m USING (year_month, segmento)
  `);
}

export async function refreshMarketPenetrationMonthly() {
  const sql = db();
  await refreshTable(sql, 'market_penetration_monthly_all', false);
  await refreshTable(sql, 'market_penetration_monthly_china', true);

  const [all] = await sql.query(`
    SELECT COUNT(*)::int AS rows, MIN(year_month) AS desde, MAX(year_month) AS hasta
    FROM market_penetration_monthly_all
  `);
  const [china] = await sql.query(`
    SELECT COUNT(*)::int AS rows, MIN(year_month) AS desde, MAX(year_month) AS hasta
    FROM market_penetration_monthly_china
  `);
  return { all, china };
}
