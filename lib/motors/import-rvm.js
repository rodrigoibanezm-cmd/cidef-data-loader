import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { listFilesInFolder, downloadFileToPath } from '../drive.js';
import {
  beginTableSnapshot,
  appendTableRows,
  commitTableSnapshot,
  abortTableSnapshot,
} from '../neon.js';

const TABLE_NAME = 'rvm_raw';
const QUEUE_SIZE = 50;

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

function sameColumns(a, b) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

async function streamWorkbook(filePath, file, snapshotState) {
  const year = file.name.match(/RVM_(\d{4})/i)?.[1] ?? null;
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
  });

  let sheetName = null;
  let columns = null;
  let queue = [];
  let rowsLoaded = 0;

  for await (const worksheet of workbook) {
    sheetName = worksheet.name;

    for await (const row of worksheet) {
      if (!columns) {
        const headers = [];
        for (let i = 1; i <= row.cellCount; i++) headers.push(row.getCell(i).text);
        columns = uniqueColumns(headers);

        if (!snapshotState.snapshot) {
          const allColumns = ['source_year', 'source_file', 'source_sheet', ...columns];
          snapshotState.columns = columns;
          snapshotState.snapshot = await beginTableSnapshot(TABLE_NAME, allColumns);
        } else if (!sameColumns(snapshotState.columns, columns)) {
          throw new Error(`RVM columns differ in ${file.name}`);
        }
        continue;
      }

      const values = columns.map((_, i) => {
        const text = row.getCell(i + 1).text;
        return text === '' ? null : text;
      });
      if (values.every((value) => value === null)) continue;

      queue.push([year, file.name, sheetName, ...values]);
      if (queue.length >= QUEUE_SIZE) {
        await appendTableRows(snapshotState.snapshot, queue);
        rowsLoaded += queue.length;
        queue = [];
      }
    }
    break;
  }

  if (!columns) throw new Error(`RVM workbook has no data: ${file.name}`);
  if (queue.length) {
    await appendTableRows(snapshotState.snapshot, queue);
    rowsLoaded += queue.length;
  }

  return { file: file.name, sheet: sheetName, rowsLoaded };
}

export async function run() {
  const startedAt = Date.now();
  const files = (await listFilesInFolder('RVM_'))
    .filter((f) => /^RVM_\d{4}\.xlsx?$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!files.length) throw new Error('No RVM files found in Drive folder');

  const state = { snapshot: null, columns: null };
  const loaded = [];

  try {
    for (const file of files) {
      const filePath = path.join(os.tmpdir(), `${file.id}.xlsx`);
      await downloadFileToPath(file.id, filePath);
      try {
        loaded.push(await streamWorkbook(filePath, file, state));
      } finally {
        await fs.unlink(filePath).catch(() => {});
      }
    }

    await commitTableSnapshot(state.snapshot);
    return {
      filesLoaded: files.length,
      fileNames: files.map((f) => f.name),
      rowsLoaded: loaded.reduce((sum, item) => sum + item.rowsLoaded, 0),
      files: loaded,
      table: TABLE_NAME,
      queueSize: QUEUE_SIZE,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (state.snapshot) await abortTableSnapshot(state.snapshot);
    throw error;
  }
}
