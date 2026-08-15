import { findFileInFolder, downloadFile } from '../drive.js';
import { parseSheet } from '../xlsx.js';
import { beginTableSnapshot, appendTableRows, abortTableSnapshot } from '../neon.js';
import { cleanInventoryTable } from '../inventory-cleaning.js';
import { mergeInventoryStaging } from '../inventory-sync.js';

const FILE_NAME = 'Base_Unidades_por_Vistas_20210819.xlsx';
const SHEET_NAME = 'Inventario Vehiculos Global';
const TABLE_NAME = 'inventario_vehiculos_global_raw';

export async function run() {
  const startedAt = Date.now();
  const file = await findFileInFolder(FILE_NAME);
  const buffer = await downloadFile(file.id);
  const { columns, rows } = parseSheet(buffer, SHEET_NAME);
  const snapshot = await beginTableSnapshot(TABLE_NAME, columns);
  try {
    const loaded = await appendTableRows(snapshot, rows);
    const cleaned = await cleanInventoryTable(snapshot.staging);
    const merged = await mergeInventoryStaging(snapshot.staging, TABLE_NAME);
    await abortTableSnapshot(snapshot);
    return {
      source: { id: file.id, name: file.name, modifiedTime: file.modifiedTime },
      sheet: SHEET_NAME, table: TABLE_NAME,
      rowsLoaded: rows.length, columnsLoaded: columns.length,
      batchSize: loaded.batchSize, cleaned, merged,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    await abortTableSnapshot(snapshot);
    throw error;
  }
}
