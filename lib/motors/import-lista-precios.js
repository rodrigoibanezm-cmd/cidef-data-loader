import { randomUUID } from 'node:crypto';
import { listFilesInFolder, downloadFile } from '../drive.js';
import { parsePriceWorkbook } from '../price-list.js';
import { normalizePriceRecord } from '../price-normalizer.js';
import { queryDb } from '../neon.js';

const STAGING_TABLE = 'price_import_staging';

async function stageRecords(runId, records) {
  const batchSize = 40;
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize);
    const values = [];
    let p = 1;
    const tuples = batch.map((record) => {
      const tuple = [
        runId,
        record.source_file,
        record.source_sheet,
        Number(record.source_row) || null,
        record.vigencia,
        record.product_group,
        JSON.stringify(record),
      ];
      values.push(...tuple);
      const refs = tuple.map((_, i) => `$${p + i}`);
      p += tuple.length;
      refs[6] = `${refs[6]}::jsonb`;
      return `(${refs.join(', ')})`;
    });

    await queryDb(
      `INSERT INTO ${STAGING_TABLE}
       (run_id, source_file, source_sheet, source_row, vigencia, product_group, payload)
       VALUES ${tuples.join(', ')}`,
      values,
    );
  }
}

async function getPriceVersionId(item, cache) {
  const key = `${item.marca}|${item.modelo}|${item.version}`;
  if (cache.has(key)) return cache.get(key);

  const rows = await queryDb(
    `INSERT INTO price_versions (marca, modelo, version, source_sheet, activo)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (marca, modelo, version)
     DO UPDATE SET activo = true
     RETURNING price_version_id`,
    [item.marca, item.modelo, item.version, item.source_sheet],
  );
  const id = rows[0].price_version_id;
  cache.set(key, id);
  return id;
}

async function persistCanonical(items) {
  const cache = new Map();
  let historyInserted = 0;

  for (const item of items) {
    const priceVersionId = await getPriceVersionId(item, cache);
    const rows = await queryDb(
      `INSERT INTO price_history (
         price_version_id, vigencia_desde, precio_neto, precio_lista, precio_con_iva,
         bono_cidef, bono_forum, bono_mes, source_file, source_sheet, source_row, raw_payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       ON CONFLICT (price_version_id, vigencia_desde, source_file, source_sheet, source_row)
       DO NOTHING
       RETURNING price_history_id`,
      [
        priceVersionId, item.vigencia_desde, item.precio_neto, item.precio_lista,
        item.precio_con_iva, item.bono_cidef, item.bono_forum, item.bono_mes,
        item.source_file, item.source_sheet, item.source_row, JSON.stringify(item.raw_payload),
      ],
    );
    if (rows.length) historyInserted += 1;
  }

  return { versionsTouched: cache.size, historyInserted };
}

export async function run() {
  const startedAt = Date.now();
  const runId = randomUUID();
  const files = (await listFilesInFolder('LISTA DE PRECIOS'))
    .filter((f) => f.name.toLowerCase().endsWith('.xlsb'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!files.length) throw new Error('No XLSB price-list files found in Drive folder');

  const records = [];
  for (const file of files) {
    const buffer = await downloadFile(file.id);
    records.push(...parsePriceWorkbook(buffer, file.name).records);
  }

  await stageRecords(runId, records);

  try {
    const normalized = records.map(normalizePriceRecord).filter(Boolean);
    const result = await persistCanonical(normalized);
    await queryDb(`DELETE FROM ${STAGING_TABLE} WHERE run_id = $1`, [runId]);

    return {
      runId,
      filesLoaded: files.length,
      rowsStaged: records.length,
      rowsNormalized: normalized.length,
      rowsRejected: records.length - normalized.length,
      ...result,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    throw new Error(`Price import failed; staging preserved for run ${runId}: ${error.message}`);
  }
}
