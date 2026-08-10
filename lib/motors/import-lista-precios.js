import { listFilesInFolder, downloadFile } from '../drive.js';
import { parsePriceWorkbook } from '../price-list.js';
import { replaceTableSnapshot } from '../neon.js';

const TABLE_NAME = 'lista_precios_raw';

export async function run() {
  const startedAt = Date.now();
  const files = (await listFilesInFolder('LISTA DE PRECIOS'))
    .filter((f) => f.name.toLowerCase().endsWith('.xlsb'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!files.length) throw new Error('No XLSB price-list files found in Drive folder');

  const parsed = [];
  for (const file of files) {
    const buffer = await downloadFile(file.id);
    parsed.push({ file, data: parsePriceWorkbook(buffer, file.name) });
  }

  const columns = [...new Set(parsed.flatMap((x) => x.data.columns))];
  const rows = [];
  for (const item of parsed) {
    const index = new Map(item.data.columns.map((c, i) => [c, i]));
    for (const row of item.data.rows) {
      rows.push(columns.map((c) => index.has(c) ? row[index.get(c)] : null));
    }
  }

  const result = await replaceTableSnapshot(TABLE_NAME, columns, rows);
  return {
    filesLoaded: files.length,
    fileNames: files.map((f) => f.name),
    ...result,
    elapsedMs: Date.now() - startedAt,
  };
}
