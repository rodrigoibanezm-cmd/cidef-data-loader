import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

export async function run(input = {}) {
  const sql = db();
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
  const vin = input.vin ? String(input.vin) : null;

  const params = [];
  let where = `WHERE factura IS NOT NULL AND numero_factura IS NOT NULL`;
  if (vin) {
    params.push(vin);
    where += ` AND vin_chasis = $${params.length}`;
  }

  const query = `
    SELECT
      empresa, factura, numero_factura, vin_chasis,
      MAX(nro_operacion) AS nro_operacion,
      MAX(nota_de_venta) AS nota_de_venta,
      MAX(fecha_factura) AS fecha_factura,
      MAX(cliente) AS cliente,
      MAX(marca) AS marca,
      MAX(modelo) AS modelo,
      MAX(importe_total_con_iva) AS importe_total_con_iva,
      COUNT(DISTINCT nro_recibo) AS cantidad_recibos,
      SUM(COALESCE(NULLIF(importe_recibo, '')::numeric, 0)) AS importe_total_recibos
    FROM inventario_vehiculos_global_raw
    ${where}
    GROUP BY empresa, factura, numero_factura, vin_chasis
    ORDER BY MAX(fecha_factura) DESC NULLS LAST
    LIMIT ${limit}`;

  const rows = await sql.query(query, params);
  return { table: 'inventario_vehiculos_global_raw', grain: 'sale', rowsReturned: rows.length, rows };
}
