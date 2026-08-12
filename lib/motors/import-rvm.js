import { listFilesInFolder, downloadFile } from '../drive.js';
import XLSX from 'xlsx';
import {
  beginTableSnapshot,
  appendTableRows,
  commitTableSnapshot,
  abortTableSnapshot,
} from '../neon.js';

const TABLE_NAME = 'rvm_raw';

function normalizeName(value, index) {
  const base = String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return base || `col_${index + 1}`;
}

function uniqueColumns(headers) {
  const seen = new Map();
  return headers.map((header, index) => {
    const base = normalizeName(header, index);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('RVM workbook has no sheets');
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1, defval: null, raw: false, blankrows: false,
  });
  if (matrix.length < 2) throw new Error(`RVM sheet has no data: ${sheetName}`);
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = uniqueColumns(Array.from({ length: width }, (_, i) => matrix[0][i]));
  const rows = matrix.slice(1)
    .filter((row) => row.some((value) => value !== null && value !== ''))
    .map((row) => columns.map((_, i) => {
      const value = row[i];
      return value === null || value === undefined || value === '' ? null : String(value);
    }));
  return { sheetName, columns, rows };
}

export async function run() {
  const startedAt = Date.now();
  const files = (await listFilesInFolder('RVM_'))
    .filter((f) => /^RVM_\d{4}\.xlsx?$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!files.length) throw new Error('No RVM files found in Drive folder');

  let snapshot;
  let baseColumns;
  let rowsLoaded = 0;
  let batchSize = null;
  const sheets = [];

  try {
    for (const file of files) {
      const buffer = await downloadFile(file.id);
      const data = parseWorkbook(buffer);
      const year = file.name.match(/RVM_(\d{4})/i)?.[1] ?? null;

      if (!snapshot) {
        baseColumns = data.columns;
        snapshot = await beginTableSnapshot(TABLE_NAME, [
          'source_year', 'source_file', 'source_sheet', ...baseColumns,
        ]);
      } else if (JSON.stringify(data.columns) !== JSON.stringify(baseColumns)) {
        throw new Error(`RVM schema mismatch: ${file.name}`);
      }

      for (const row of data.rows) row.unshift(year, file.name, data.sheetName);
      const result = await appendTableRows(snapshot, data.rows);
      rowsLoaded += result.rowsLoaded;
      batchSize = result.batchSize;
      sheets.push({ file: file.name, sheet: data.sheetName, rows: result.rowsLoaded });
    }

    await commitTableSnapshot(snapshot);
  } catch (error) {
    if (snapshot) await abortTableSnapshot(snapshot);
    throw error;
  }

  return {
    filesLoaded: files.length,
    fileNames: files.map((f) => f.name),
    sheets,
    rowsLoaded,
    columnsLoaded: baseColumns.length + 3,
    table: TABLE_NAME,
    batchSize,
    elapsedMs: Date.now() - startedAt,
  };
}
