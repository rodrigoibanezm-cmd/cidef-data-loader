import { neon } from '@neondatabase/serverless';

const TABLE = 'inventario_vehiculos_global_raw';
const DROP_COLUMNS = [
  'empresa', 'tipo', 'nro_stock', 'modelo', 'serie', 'embarque',
  'esta_fisico', 'descuentos', 'recibo', 'pre_entrega_ok',
  'desc_maestro_valor', 'cod_inf_tecnico', 'ley', 'detalle_vehiculo',
  'autorizada', 'tiene_operacion', 'nro_operacion', 'gestion_operacion',
  'id_empresa', 'id_emp_sucursal',
];

const receiptDateSql = `CASE
  WHEN TRIM(fecha_recibo) ~ '^\\d{1,2}/\\d{1,2}/\\d{2} \\d{1,2}:\\d{2}$'
  THEN to_timestamp(TRIM(fecha_recibo), 'MM/DD/YY HH24:MI')
END`;

export async function run() {
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const [{ count: before }] = await sql.query(`SELECT COUNT(*)::int AS count FROM ${TABLE}`);

  const typeCut = await sql.query(`DELETE FROM ${TABLE}
    WHERE tipo IS NULL OR TRIM(tipo) <> 'Vehiculo Nuevo'
    RETURNING 1`);

  const vinDedup = await sql.query(`WITH ranked AS (
    SELECT ctid, ROW_NUMBER() OVER (
      PARTITION BY TRIM(vin_chasis)
      ORDER BY ${receiptDateSql} DESC NULLS LAST,
        CASE WHEN TRIM(nro_recibo) ~ '^\\d+$' THEN TRIM(nro_recibo)::bigint END DESC NULLS LAST,
        ctid DESC
    ) AS rn
    FROM ${TABLE}
    WHERE NULLIF(TRIM(vin_chasis), '') IS NOT NULL
  )
  DELETE FROM ${TABLE} t USING ranked r
  WHERE t.ctid=r.ctid AND r.rn>1 RETURNING 1`);

  const stockDedup = await sql.query(`WITH ranked AS (
    SELECT ctid, ROW_NUMBER() OVER (
      PARTITION BY TRIM(nro_stock)
      ORDER BY ${receiptDateSql} DESC NULLS LAST,
        CASE WHEN TRIM(nro_recibo) ~ '^\\d+$' THEN TRIM(nro_recibo)::bigint END DESC NULLS LAST,
        ctid DESC
    ) AS rn
    FROM ${TABLE}
    WHERE NULLIF(TRIM(vin_chasis), '') IS NULL
  )
  DELETE FROM ${TABLE} t USING ranked r
  WHERE t.ctid=r.ctid AND r.rn>1 RETURNING 1`);

  await sql.query(`ALTER TABLE ${TABLE} ${DROP_COLUMNS.map(c => `DROP COLUMN ${c}`).join(', ')}`);
  const [{ count: after }] = await sql.query(`SELECT COUNT(*)::int AS count FROM ${TABLE}`);

  return {
    table: TABLE, before, after,
    removed: {
      non_vehicle_new: typeCut.length,
      duplicate_vin_rows: vinDedup.length,
      duplicate_stock_rows_without_vin: stockDedup.length,
    },
    dropped_columns: DROP_COLUMNS,
  };
}
