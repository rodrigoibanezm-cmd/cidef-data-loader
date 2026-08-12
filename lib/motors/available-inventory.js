import { neon } from '@neondatabase/serverless';

const TABLE = 'inventario_vehiculos_global_raw';

export async function run(input = {}) {
  const minAgeDays = Number(input.min_age_days ?? 0);
  const groupBy = input.group_by || null;
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  const rows = await sql.query(`
    WITH base AS (
      SELECT
        vin_chasis,
        MAX(TRIM(marca)) AS marca,
        MAX(TRIM(modelo)) AS modelo,
        MAX(TRIM(bodega)) AS bodega,
        MIN(TO_TIMESTAMP(fecha_eta, 'MM/DD/YY HH24:MI')::date) AS fecha_eta,
        CURRENT_DATE - MIN(TO_TIMESTAMP(fecha_eta, 'MM/DD/YY HH24:MI')::date) AS dias_antiguedad
      FROM ${TABLE}
      WHERE tipo = 'Vehiculo Nuevo'
        AND (factura IS NULL OR TRIM(factura) = '')
        AND vigente = '1'
        AND (etapa IS NULL OR etapa NOT IN ('VH', 'TL'))
        AND fecha_eta IS NOT NULL
        AND TRIM(fecha_eta) <> ''
      GROUP BY vin_chasis
      HAVING CURRENT_DATE - MIN(TO_TIMESTAMP(fecha_eta, 'MM/DD/YY HH24:MI')::date) >= $1
    )
    SELECT * FROM base
    ORDER BY dias_antiguedad DESC
  `, [minAgeDays]);

  if (groupBy === 'bodega') {
    const grouped = Object.values(rows.reduce((acc, row) => {
      const key = row.bodega || 'SIN_BODEGA';
      acc[key] ||= { bodega: key, total_vehiculos: 0 };
      acc[key].total_vehiculos += 1;
      return acc;
    }, {})).sort((a, b) => b.total_vehiculos - a.total_vehiculos);

    return { table: TABLE, grain: 'distinct_vin', min_age_days: minAgeDays, group_by: 'bodega', rows: grouped };
  }

  return { table: TABLE, grain: 'distinct_vin', min_age_days: minAgeDays, rows };
}
