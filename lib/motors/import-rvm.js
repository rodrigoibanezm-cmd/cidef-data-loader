import { listFilesInFolder, downloadFile } from '../drive.js';
import { openRvmWorkbook } from '../rvm-xlsx-stream.js';
import {
  KEEP, appendStage, documentLoaded, ensureFinalSchema, normalizeAndAppend, resetStage,
} from '../rvm-cleaner.js';
import { refreshMarketPenetrationMonthly } from '../market-penetration-monthly.js';

const BATCH_SIZE = 250;
const REQUIRED = ['mercado', ...KEEP];

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function headerMap(values) {
  const map = new Map(values.map((v, i) => [normalizeName(v), i]));
  const missing = REQUIRED.filter(c => !map.has(c));
  if (missing.length) throw new Error(`RVM missing columns: ${missing.join(', ')}`);
  return map;
}

async function stageFile(file) {
  const buffer = await downloadFile(file.id);
  const workbook = await openRvmWorkbook(buffer);
  let map;
  let queue = [];
  let extracted = 0;

  await resetStage();
  for await (const row of workbook.rows()) {
    if (!map) { map = headerMap(row.values); continue; }
    const values = REQUIRED.map(c => row.values[map.get(c)] ?? null);
    if (values.every(v => v == null || v === '')) continue;
    queue.push([values[0], row.number, ...values.slice(1)]);
    if (queue.length >= BATCH_SIZE) {
      await appendStage(queue);
      extracted += queue.length;
      queue = [];
    }
  }
  if (queue.length) { await appendStage(queue); extracted += queue.length; }
  return extracted;
}

export async function run(input = {}) {
  const startedAt = Date.now();
  await ensureFinalSchema();
  let files = (await listFilesInFolder('RVM_'))
    .filter(f => /^RVM_.*\.xlsx?$/i.test(f.name))
    .sort((a, b) => new Date(a.createdTime ?? a.modifiedTime) - new Date(b.createdTime ?? b.modifiedTime));
  if (input.fileName) files = files.filter(f => f.name === input.fileName);
  if (!files.length) throw new Error('No RVM files found');

  const results = [];
  let loadedAny = false;
  for (const file of files) {
    if (await documentLoaded(file.name)) {
      results.push({ file: file.name, status: 'already_loaded' });
      continue;
    }
    const staged = await stageFile(file);
    const appended = await normalizeAndAppend(file);
    loadedAny = true;
    results.push({ file: file.name, status: 'loaded', staged, appended });
  }

  const penetration = loadedAny ? await refreshMarketPenetrationMonthly() : null;
  return { table: 'rvm_raw', files: results, penetration, elapsedMs: Date.now() - startedAt };
}
