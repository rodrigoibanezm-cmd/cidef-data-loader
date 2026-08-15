import { neon } from '@neondatabase/serverless';

const DROP_COLUMNS = [
  'empresa', 'tipo', 'nro_stock', 'modelo', 'serie', 'embarque',
  'esta_fisico', 'descuentos', 'recibo', 'pre_entrega_ok',
  'desc_maestro_valor', 'cod_inf_tecnico', 'ley', 'detalle_vehiculo',
  'autorizada', 'tiene_operacion', 'nro_operacion', 'gestion_operacion',
  'id_empresa', 'id_emp_sucursal',
];

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const receiptDate = `CASE WHEN TRIM(fecha_recibo) ~ '^\\d{1,2}/\\d{1,2}/\\d{2} \\d{1,2}:\\d{2}$'
  THEN to_timestamp(TRIM(fecha_recibo), 'MM/DD/YY HH24:MI') END`;

export async function cleanInventoryTable(table) {
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const t = q(table);
  const [{ count: before }] = await sql.query(`SELECT COUNT(*)::int count FROM ${t}`);
  const cut = await sql.query(`DELETE FROM ${t} WHERE tipo IS NULL OR TRIM(tipo) <> 'Vehiculo Nuevo' RETURNING 1`);
  const dupVin = await sql.query(`WITH r AS (SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY TRIM(vin_chasis) ORDER BY ${receiptDate} DESC NULLS LAST,
    CASE WHEN TRIM(nro_recibo) ~ '^\\d+$' THEN TRIM(nro_recibo)::bigint END DESC NULLS LAST, ctid DESC) rn
    FROM ${t} WHERE NULLIF(TRIM(vin_chasis),'') IS NOT NULL)
    DELETE FROM ${t} x USING r WHERE x.ctid=r.ctid AND r.rn>1 RETURNING 1`);
  const dupStock = await sql.query(`WITH r AS (SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY TRIM(nro_stock) ORDER BY ${receiptDate} DESC NULLS LAST,
    CASE WHEN TRIM(nro_recibo) ~ '^\\d+$' THEN TRIM(nro_recibo)::bigint END DESC NULLS LAST, ctid DESC) rn
    FROM ${t} WHERE NULLIF(TRIM(vin_chasis),'') IS NULL)
    DELETE FROM ${t} x USING r WHERE x.ctid=r.ctid AND r.rn>1 RETURNING 1`);
  await sql.query(`ALTER TABLE ${t} ${DROP_COLUMNS.map(c => `DROP COLUMN ${q(c)}`).join(', ')}`);
  const [{ count: after }] = await sql.query(`SELECT COUNT(*)::int count FROM ${t}`);
  return { before, after, removed: { non_vehicle_new: cut.length, duplicate_vin_rows: dupVin.length, duplicate_stock_rows_without_vin: dupStock.length }, dropped_columns: DROP_COLUMNS };
}
