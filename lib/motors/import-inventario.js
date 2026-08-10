import { findFileInFolder, downloadFile } from '../drive.js';
import { parseSheet } from '../xlsx.js';
import { replaceTableSnapshot } from '../neon.js';

const FILE_NAME = 'Base_Unidades_por_Vistas_20210819.xlsx';
const SHEET_NAME = 'Inventario Vehiculos Global';
const TABLE_NAME = 'inventario_vehiculos_global_raw';

export async function run() {
  const startedAt = Date.now();
  const file = await findFileInFolder(FILE_NAME);
  const buffer = await downloadFile(file.id);
  const { columns, rows } = parseSheet(buffer, SHEET_NAME);
  const result = await replaceTableSnapshot(TABLE_NAME, columns, rows);

  return {
    source: { id: file.id, name: file.name, modifiedTime: file.modifiedTime },
    sheet: SHEET_NAME,
    ...result,
    elapsedMs: Date.now() - startedAt,
  };
}
