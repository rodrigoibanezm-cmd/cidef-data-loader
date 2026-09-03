import { listFilesInFolder, downloadFile } from '../drive.js';
import { appendTableData } from '../neon.js';

const TABLE_NAME = 'CRM_Cidef_raw';
const FILE_PATTERN = /^export_cidef_.*\.csv$/i;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

export async function run(input = {}) {
  const startedAt = Date.now();
  let files = (await listFilesInFolder('export_cidef_'))
    .filter((file) => FILE_PATTERN.test(file.name))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  if (input.fileName) files = files.filter((file) => file.name === input.fileName);
  if (!files.length) throw new Error('No export_cidef CSV files found');

  const results = [];
  for (const file of files) {
    const buffer = await downloadFile(file.id);
    const parsed = parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, ''));
    if (parsed.length < 2) {
      results.push({ file: file.name, rows: 0, status: 'empty' });
      continue;
    }

    const columns = parsed[0].map((value) => String(value).trim());
    const dataRows = parsed.slice(1).filter((row) => row.some((value) => String(value ?? '').trim() !== ''));
    const malformed = dataRows.findIndex((row) => row.length !== columns.length);
    if (malformed !== -1) {
      throw new Error(`Malformed CRM CSV ${file.name} at data row ${malformed + 2}: expected ${columns.length} columns, got ${dataRows[malformed].length}`);
    }

    const metadataColumns = ['source_file', 'source_file_id', 'loaded_at'];
    const loadedAt = new Date().toISOString();
    const rows = dataRows.map((row) => [...row, file.name, file.id, loadedAt]);
    const result = await appendTableData(TABLE_NAME, [...columns, ...metadataColumns], rows);

    results.push({ file: file.name, rows: rows.length, status: 'loaded', batchSize: result.batchSize });
  }

  return {
    table: TABLE_NAME,
    strategy: 'APPEND_ONLY',
    files: results,
    rowsAppended: results.reduce((sum, item) => sum + (item.rows || 0), 0),
    elapsedMs: Date.now() - startedAt,
  };
}
