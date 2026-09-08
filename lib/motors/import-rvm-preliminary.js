import { neon } from '@neondatabase/serverless';
import { listFilesInFolder, downloadFile } from '../drive.js';
import { openRvmWorkbook } from '../rvm-xlsx-stream.js';
import { KEEP } from '../rvm-cleaner.js';
import { parsePreliminaryRows, selectLatestPreliminaryFile } from '../rvm-preliminary.js';

const FINAL = 'public.rvm_raw';
const BATCH_SIZE = 250;

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

async function ensureSchema(sql) {
  await sql.query(`ALTER TABLE ${FINAL} ADD COLUMN IF NOT EXISTS data_status text`);
  await sql.query(`ALTER TABLE ${FINAL} ADD COLUMN IF NOT EXISTS snapshot_date date`);
  await sql.query(`UPDATE ${FINAL} SET data_status='CONSOLIDATED' WHERE data_status IS NULL`);
}

function sqlRows(rows, file, snapshotDate) {
  return rows.map((row) => [
    ...KEEP.map((column) => row[column] ?? null),
    row.fecha,
    file.name,
    file.createdTime ?? file.modifiedTime ?? null,
    row.source_row,
    'PRELIMINARY',
    snapshotDate,
  ]);
}

async function replaceSnapshot(sql, parsed, file, hooks = {}) {
  const beforeConsolidated = await sql.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(cantidad),0)::bigint AS quantity
     FROM ${FINAL} WHERE ano=$1 AND mes=$2 AND data_status='CONSOLIDATED'`,
    [parsed.year, parsed.month],
  );

  await sql.query('BEGIN');
  try {
    await sql.query(
      `DELETE FROM ${FINAL} WHERE ano=$1 AND mes=$2 AND data_status='PRELIMINARY'`,
      [parsed.year, parsed.month],
    );

    const cols = [...KEEP, 'fecha','documento_origen','fecha_creacion_documento','fecha_ingesta','source_row','data_status','snapshot_date'];
    const data = sqlRows(parsed.rows, file, parsed.snapshot_date);
    for (let offset = 0; offset < data.length; offset += BATCH_SIZE) {
      const batch = data.slice(offset, offset + BATCH_SIZE);
      const values = [];
      let p = 1;
      const tuples = batch.map((row) => `(${row.map((value) => { values.push(value); return `$${p++}`; }).join(',')})`);
      await sql.query(
        `INSERT INTO ${FINAL} (${cols.map((c) => `"${c}"`).join(',')})
         VALUES ${tuples.join(',')}`,
        values,
      );
      if (hooks.afterBatch) await hooks.afterBatch(offset / BATCH_SIZE, batch.length);
    }
    await sql.query('COMMIT');
  } catch (error) {
    await sql.query('ROLLBACK');
    throw error;
  }

  const [post] = await sql.query(
    `SELECT COUNT(*)::int AS rows_loaded,
            COALESCE(SUM(cantidad),0)::bigint AS quantity_total,
            MIN(fecha)::text AS min_date,
            MAX(fecha)::text AS max_date,
            COUNT(DISTINCT marca)::int AS brands_count,
            COUNT(DISTINCT descripcion_segmento)::int AS segments_count,
            COUNT(DISTINCT snapshot_date)::int AS snapshot_dates,
            MIN(snapshot_date)::text AS snapshot_date
     FROM ${FINAL}
     WHERE ano=$1 AND mes=$2 AND data_status='PRELIMINARY'`,
    [parsed.year, parsed.month],
  );
  const [oldSnapshots] = await sql.query(
    `SELECT COUNT(*)::int AS count FROM ${FINAL}
     WHERE ano=$1 AND mes=$2 AND data_status='PRELIMINARY' AND snapshot_date<>$3::date`,
    [parsed.year, parsed.month, parsed.snapshot_date],
  );
  const [afterConsolidated] = await sql.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(cantidad),0)::bigint AS quantity
     FROM ${FINAL} WHERE ano=$1 AND mes=$2 AND data_status='CONSOLIDATED'`,
    [parsed.year, parsed.month],
  );

  const before = beforeConsolidated[0];
  if (Number(post.rows_loaded) !== parsed.rows.length) throw new Error(`Post-load row count mismatch: expected ${parsed.rows.length}, got ${post.rows_loaded}`);
  if (Number(post.snapshot_dates) !== 1 || post.snapshot_date !== parsed.snapshot_date) throw new Error('Post-load snapshot_date is not uniform');
  if (Number(oldSnapshots.count) !== 0) throw new Error('Previous PRELIMINARY snapshot rows remain');
  if (Number(before.count) !== Number(afterConsolidated.count) || String(before.quantity) !== String(afterConsolidated.quantity)) {
    throw new Error('CONSOLIDATED rows changed during preliminary load');
  }
  return post;
}

export async function run(input = {}) {
  const startedAt = Date.now();
  const files = await listFilesInFolder('data');
  const file = input.fileName
    ? files.find((candidate) => candidate.name === input.fileName)
    : selectLatestPreliminaryFile(files);
  if (!file) throw new Error(`RVM preliminary file not found: ${input.fileName}`);

  const buffer = await downloadFile(file.id);
  const workbook = await openRvmWorkbook(buffer, { sheetName: 'Export' });
  const iterator = workbook.rows();
  const first = await iterator.next();
  if (first.done) throw new Error('RVM preliminary workbook has no rows');
  const remaining = [];
  for await (const row of iterator) remaining.push(row);
  const parsed = parsePreliminaryRows(remaining, first.value.values, file, input);

  const sql = db();
  await ensureSchema(sql);
  const post = await replaceSnapshot(sql, parsed, file);

  return {
    status: 'loaded',
    source_file: file.name,
    year: parsed.year,
    month: parsed.month,
    snapshot_date: parsed.snapshot_date,
    data_status: 'PRELIMINARY',
    rows_loaded: Number(post.rows_loaded),
    quantity_total: Number(post.quantity_total),
    min_date: post.min_date,
    max_date: post.max_date,
    brands_count: Number(post.brands_count),
    segments_count: Number(post.segments_count),
    warnings: [],
    elapsed_ms: Date.now() - startedAt,
  };
}

export { replaceSnapshot };
