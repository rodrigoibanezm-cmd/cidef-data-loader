import { neon } from '@neondatabase/serverless';
import { findFileInFolder, downloadFile } from '../drive.js';
import { parseSheet } from '../xlsx.js';
import { beginTableSnapshot, appendTableRows, abortTableSnapshot } from '../neon.js';

const FILE_NAME = 'Estadisticas_de_Venta_por_Vista_20210920.xlsx';
const SHEET_NAME = 'Ventas';
const TABLE_NAME = 'estadisticas_venta_raw';
const TARGET = 'inventario_vehiculos_global_raw';
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;

export async function run() {
  const startedAt = Date.now();
  const file = await findFileInFolder(FILE_NAME);
  const buffer = await downloadFile(file.id);
  const { columns, rows } = parseSheet(buffer, SHEET_NAME);
  const snapshot = await beginTableSnapshot(TABLE_NAME, columns);
  try {
    const loaded = await appendTableRows(snapshot, rows);
    const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
    await sql.query(`ALTER TABLE ${q(TARGET)} ADD COLUMN IF NOT EXISTS sucursal_venta text`);
    const updated = await sql.query(`WITH src AS (
      SELECT DISTINCT ON (TRIM(nro_vin_chasis)) TRIM(nro_vin_chasis) vin,
        NULLIF(TRIM(desc_sucursal_vta),'') sucursal_venta
      FROM ${q(snapshot.staging)}
      WHERE NULLIF(TRIM(nro_vin_chasis),'') IS NOT NULL
      ORDER BY TRIM(nro_vin_chasis),
        CASE WHEN TRIM(fecha_factura) ~ '^\\d{1,2}/\\d{1,2}/\\d{2} \\d{1,2}:\\d{2}$'
          THEN to_timestamp(TRIM(fecha_factura),'MM/DD/YY HH24:MI') END DESC NULLS LAST,
        ctid DESC)
      UPDATE ${q(TARGET)} t SET sucursal_venta=src.sucursal_venta FROM src
      WHERE TRIM(t.vin_chasis)=src.vin RETURNING 1`);
    await abortTableSnapshot(snapshot);
    return {
      source: { id: file.id, name: file.name, modifiedTime: file.modifiedTime },
      sheet: SHEET_NAME, table: TARGET,
      rowsLoaded: rows.length, columnsLoaded: columns.length,
      batchSize: loaded.batchSize, enrichedRows: updated.length,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    await abortTableSnapshot(snapshot);
    throw error;
  }
}
