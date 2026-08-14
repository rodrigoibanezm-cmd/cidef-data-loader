import { neon } from '@neondatabase/serverless';

const TABLE = 'inventario_vehiculos_global_raw';

export async function run(input = {}) {
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  const minDays = input.min_days == null ? null : Number(input.min_days);
  const maxDays = input.max_days == null ? null : Number(input.max_days);
  const vendedor = input.vendedor ? String(input.vendedor).trim() : null;
  const bodega = input.bodega ? String(input.bodega).trim() : null;
  const marca = input.marca ? String(input.marca).trim() : null;
  const modelo = input.modelo ? String(input.modelo).trim() : null;
  const cliente = input.cliente ? String(input.cliente).trim() : null;
  const limit = Math.min(Math.max(Number(input.limit ?? 1000), 1), 5000);

  const rows = await sql.query(`
    WITH base AS (
      SELECT
        vin_chasis,
        MAX(TRIM(marca)) AS marca,
        MAX(TRIM(modelo)) AS modelo,
        MAX(TRIM(cliente)) AS cliente,
        MAX(TRIM(vendedor)) AS vendedor,
        MAX(TRIM(bodega)) AS bodega,
        MAX(TRIM(nota_de_venta)) AS nota_de_venta,
        MAX(TO_TIMESTAMP(fecha_nv, 'MM/DD/YY HH24:MI')::date) AS fecha_nv,
        CURRENT_DATE - MAX(TO_TIMESTAMP(fecha_nv, 'MM/DD/YY HH24:MI')::date) AS dias_abierta
      FROM ${TABLE}
      WHERE (factura IS NULL OR TRIM(factura) = '')
        AND vigente = '1'
        AND nota_de_venta IS NOT NULL
        AND TRIM(nota_de_venta) <> ''
        AND cliente IS NOT NULL
        AND TRIM(cliente) <> ''
        AND fecha_nv IS NOT NULL
        AND TRIM(fecha_nv) <> ''
      GROUP BY vin_chasis
    )
    SELECT *
    FROM base
    WHERE ($1::int IS NULL OR dias_abierta >= $1)
      AND ($2::int IS NULL OR dias_abierta <= $2)
      AND ($3::text IS NULL OR UPPER(vendedor) = UPPER($3))
      AND ($4::text IS NULL OR UPPER(bodega) = UPPER($4))
      AND ($5::text IS NULL OR UPPER(marca) = UPPER($5))
      AND ($6::text IS NULL OR UPPER(modelo) = UPPER($6))
      AND ($7::text IS NULL OR UPPER(cliente) LIKE '%' || UPPER($7) || '%')
    ORDER BY dias_abierta DESC, vin_chasis
    LIMIT $8
  `, [minDays, maxDays, vendedor, bodega, marca, modelo, cliente, limit]);

  return {
    table: TABLE,
    grain: 'distinct_vin',
    universe: 'open_sales_inventory',
    filters: { min_days: minDays, max_days: maxDays, vendedor, bodega, marca, modelo, cliente, limit },
    total_vin: rows.length,
    rows,
  };
}
