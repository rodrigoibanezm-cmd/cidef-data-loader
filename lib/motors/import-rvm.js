import ExcelJS from 'exceljs';
import { listFilesInFolder, downloadFileStream } from '../drive.js';
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

function workbookReader(stream) {
  return new ExcelJS.stream.xlsx.WorkbookReader(stream, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
  });
}

async function readHeaders(fileId) {
  const stream = await downloadFileStream(fileId);
  try {
    const workbook = workbookReader(stream);
    for await (const worksheet of workbook) {
      for await (const row of worksheet) {
        const headers = [];
        for (let i = 1; i <= row.cellCount; i++) headers.push(row.getCell(i).text);
        return { sheetName: worksheet.name, columns: uniqueColumns(headers) };
      }
    }
    throw new Error('RVM workbook has no data');
  } finally {
    stream.destroy?.();
  }
}

async function processFile(file, startedAt) {
  await ensureProgress(file.name);
  const progress = await getProgress(file.name);
  if (progress?.done) return { complete: true, rowsThisRun: 0 };

  const stream = await downloadFileStream(file.id);
  const year = file.name.match(/RVM_(\d{4})/i)?.[1] ?? null;
  const workbook = workbookReader(stream);
  let columns = null;
  let allColumns = null;
  let queue = [];
  let lastQueuedRow = progress?.last_row ?? 1;
  let rowsThisRun = 0;

  try {
    for await (const worksheet of workbook) {
      for await (const row of worksheet) {
        if (!columns) {
          const headers = [];
          for (let i = 1; i <= row.cellCount; i++) headers.push(row.getCell(i).text);
          columns = uniqueColumns(headers);
          allColumns = ['source_year', 'source_file', 'source_sheet', 'source_row', ...columns];
          continue;
        }

        if (row.number <= (progress?.last_row ?? 1)) continue;

        const values = columns.map((_, i) => {
          const text = row.getCell(i + 1).text;
          return text === '' ? null : text;
        });
        if (values.every((value) => value === null)) continue;

        queue.push([year, file.name, worksheet.name, String(row.number), ...values]);
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

    throw new Error(`RVM workbook has no data: ${file.name}`);
  } finally {
    stream.destroy?.();
  }
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
