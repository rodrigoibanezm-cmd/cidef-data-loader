import { neon } from '@neondatabase/serverless';
import { findFileInFolder, downloadFile } from '../drive.js';
import { parseSheet } from '../xlsx.js';

const FILE_NAME = 'Base_Unidades_por_Vistas_20210819.xlsx';
const SHEET_NAME = 'Inventario Vehiculos Global';
const TABLE_NAME = 'inventario_vehiculos_global_raw';
const BATCH_SIZE = 500;

function normVin(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function run() {
  const startedAt = Date.now();
  const file = await findFileInFolder(FILE_NAME);
  const buffer = await downloadFile(file.id);
  const { columns, rows } = parseSheet(buffer, SHEET_NAME);
  const vinIndex = columns.indexOf('vin_chasis');
  const modelIndex = columns.indexOf('modelo');
  if (vinIndex < 0 || modelIndex < 0) throw new Error('Expected VIN_CHASIS and MODELO columns in source sheet');

  const byVin = new Map();
  for (const row of rows) {
    const vin = normVin(row[vinIndex]);
    const modelo = String(row[modelIndex] || '').trim();
    if (vin && modelo) byVin.set(vin, modelo);
  }

  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const entries = [...byVin.entries()];
  let matched = 0;
  let updated = 0;

  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const batch = entries.slice(offset, offset + BATCH_SIZE);
    const params = [];
    const values = batch.map(([vin, modelo], i) => {
      params.push(vin, modelo);
      const p = i * 2;
      return `($${p + 1}, $${p + 2})`;
    }).join(',');

    const result = await sql.query(`
      WITH source(vin, modelo) AS (VALUES ${values}),
      changed AS (
        UPDATE ${TABLE_NAME} t
        SET modelo = s.modelo
        FROM source s
        WHERE upper(regexp_replace(coalesce(t.vin_chasis,''), '[^A-Za-z0-9]', '', 'g')) = s.vin
        RETURNING (t.modelo IS DISTINCT FROM s.modelo) AS was_changed
      )
      SELECT count(*)::int AS matched,
             count(*) FILTER (WHERE was_changed)::int AS updated
      FROM changed
    `, params);
    matched += Number(result[0]?.matched || 0);
    updated += Number(result[0]?.updated || 0);
  }

  return {
    source: { id: file.id, name: file.name, modifiedTime: file.modifiedTime },
    sheet: SHEET_NAME,
    table: TABLE_NAME,
    sourceRows: rows.length,
    sourceVinsWithModel: entries.length,
    matched,
    updated,
    missing: entries.length - matched,
    elapsedMs: Date.now() - startedAt,
  };
}
