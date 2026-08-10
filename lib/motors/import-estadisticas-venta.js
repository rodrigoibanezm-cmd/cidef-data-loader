import { findFileInFolder, downloadFile } from '../drive.js';
import { parseSheet } from '../xlsx.js';
import { replaceTableSnapshot } from '../neon.js';

const FILE_NAME = 'Estadisticas_de_Venta_por_Vista_20210920.xlsx';
const SHEET_NAME = 'Ventas';
const TABLE_NAME = 'estadisticas_venta_raw';

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
