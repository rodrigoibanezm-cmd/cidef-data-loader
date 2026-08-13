import { rvmDb } from '../rvm-db.js';
import { paretoInput } from '../rvm-pareto-input.js';

export async function run(input = {}) {
  const filters = paretoInput(input);
  const sql = rvmDb();
  const [latest] = await sql.query(`SELECT COALESCE($1::text,
    to_char(date_trunc('month',MAX(fecha)),'YYYY-MM')) AS period FROM rvm_raw`, [filters.period]);
  if (!latest?.period) throw new Error('rvm_raw has no dated rows');
  const rows = await sql.query(`WITH sales AS (
    SELECT b.marca,r.modelo_homologado,SUM(r.cantidad::numeric) AS unidades
    FROM rvm_raw r JOIN brands_master b ON b.marca=r.marca
    WHERE to_char(date_trunc('month',r.fecha),'YYYY-MM')=$1
      AND ($2::text='ALL' OR b.origen_marca='CHINA')
      AND ($3::text IS NULL OR CASE WHEN r.descripcion_segmento='CAMIONETA'
        THEN 'PICK-UP' ELSE r.descripcion_segmento END=$3)
      AND ($4::text IS NULL OR b.marca=$4)
      AND NULLIF(TRIM(r.modelo_homologado),'') IS NOT NULL
    GROUP BY b.marca,r.modelo_homologado
  ), ranked AS (SELECT *,SUM(unidades) OVER () AS total_mercado,
    SUM(unidades) OVER (ORDER BY unidades DESC,marca,modelo_homologado) AS acumulado,
    ROW_NUMBER() OVER (ORDER BY unidades DESC,marca,modelo_homologado)::int AS ranking
    FROM sales)
  SELECT ranking,marca,modelo_homologado,unidades,
    ROUND(100*unidades/NULLIF(total_mercado,0),2) AS share_pct,
    ROUND(100*acumulado/NULLIF(total_mercado,0),2) AS acumulado_pct,
    total_mercado AS market_units FROM ranked
  WHERE acumulado-unidades < total_mercado*($5::numeric/100)
  ORDER BY ranking`, [latest.period, filters.universe, filters.segment, filters.brand, filters.threshold_pct]);
  const marketUnits = rows[0] ? Number(rows[0].market_units) : 0;
  return {
    period: latest.period, universe: filters.universe, segment: filters.segment,
    brand: filters.brand, threshold_pct: filters.threshold_pct,
    market_units: marketUnits, models_in_pareto: rows.length,
    rows: rows.map(({ market_units, ...row }) => ({
      ...row, ranking: Number(row.ranking), unidades: Number(row.unidades),
      share_pct: Number(row.share_pct), acumulado_pct: Number(row.acumulado_pct),
    })),
  };
}
