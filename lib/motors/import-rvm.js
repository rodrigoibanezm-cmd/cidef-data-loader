import { listFilesInFolder, downloadFile } from '../drive.js';
import { openRvmWorkbook } from '../rvm-xlsx-stream.js';
import {
  appendRvmRows,
  ensureProgress,
  finishRvmImport,
  getProgress,
  importStatus,
  markFileDone,
  resetRvmImport,
  stagingExists,
} from '../rvm-state.js';

const TABLE_NAME = 'rvm_raw';
const MAX_RUN_MS = 220000;

function normalizeName(value, index) {
  const base = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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

async function readHeaders(fileId) {
  const buffer = await downloadFile(fileId);
  const workbook = await openRvmWorkbook(buffer);
  const row = await workbook.firstRow();
  return { columns: uniqueColumns(row.values) };
}

async function processFile(file, startedAt) {
  await ensureProgress(file.name);
  const progress = await getProgress(file.name);
  if (progress?.done) return { complete: true, rowsThisRun: 0 };

  const buffer = await downloadFile(file.id);
  const workbook = await openRvmWorkbook(buffer);
  const year = file.name.match(/RVM_(\d{4})/i)?.[1] ?? null;
  let columns = null;
  let allColumns = null;
  let queue = [];
  let lastQueuedRow = progress?.last_row ?? 1;
  let rowsThisRun = 0;

  for await (const row of workbook.rows()) {
    if (!columns) {
      columns = uniqueColumns(row.values);
      allColumns = ['source_year', 'source_file', 'source_sheet', 'source_row', ...columns];
      continue;
    }

    if (row.number <= (progress?.last_row ?? 1)) continue;

    const values = columns.map((_, i) => row.values[i] ?? null);
    if (values.every((value) => value === null || value === '')) continue;

    queue.push([year, file.name, workbook.sheetName, String(row.number), ...values]);
    lastQueuedRow = row.number;

    const queueSize = Math.max(1, Math.min(50, Math.floor(8000 / allColumns.length)));
    if (queue.length >= queueSize) {
      await appendRvmRows(allColumns, queue, file.name, lastQueuedRow);
      rowsThisRun += queue.length;
      queue = [];

      if (Date.now() - startedAt >= MAX_RUN_MS) {
        return { complete: false, rowsThisRun, lastRow: lastQueuedRow };
      }
    }
  }

  if (queue.length) {
    await appendRvmRows(allColumns, queue, file.name, lastQueuedRow);
    rowsThisRun += queue.length;
  }

  await markFileDone(file.name);
  return { complete: true, rowsThisRun, lastRow: lastQueuedRow };
}

export async function run(input = {}) {
  const startedAt = Date.now();
  const files = (await listFilesInFolder('RVM_'))
    .filter((f) => /^RVM_\d{4}\.xlsx?$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!files.length) throw new Error('No RVM files found in Drive folder');

  if (input.reset === true || !(await stagingExists())) {
    const { columns } = await readHeaders(files[0].id);
    await resetRvmImport(['source_year', 'source_file', 'source_sheet', 'source_row', ...columns]);
  }

  let rowsThisRun = 0;
  for (const file of files) {
    const progress = await getProgress(file.name);
    if (progress?.done) continue;

    const result = await processFile(file, startedAt);
    rowsThisRun += result.rowsThisRun;
    if (!result.complete) {
      return {
        status: 'partial',
        table: TABLE_NAME,
        rowsThisRun,
        progress: await importStatus(),
        elapsedMs: Date.now() - startedAt,
      };
    }
  }

  await finishRvmImport();
  return {
    status: 'complete',
    table: TABLE_NAME,
    filesLoaded: files.length,
    rowsThisRun,
    elapsedMs: Date.now() - startedAt,
  };
}
