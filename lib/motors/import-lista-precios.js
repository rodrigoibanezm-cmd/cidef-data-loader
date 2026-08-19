import { randomUUID } from 'node:crypto';
import { listFilesInFolder, downloadFile } from '../drive.js';
import { parsePriceWorkbook } from '../price-list.js';
import { normalizePriceRecord } from '../price-normalizer.js';
import { queryDb } from '../neon.js';

const STAGING_TABLE = 'price_import_staging';
const FP_FIELDS = ['transmision', 'cc', 'hp', 'combustible', 'traccion', 'carga_kg', 'pasajeros', 'euro'];

async function stageRecords(runId, records) {
  const batchSize = 40;
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize);
    const values = [];
    let p = 1;
    const tuples = batch.map((record) => {
      const tuple = [runId, record.source_file, record.source_sheet, Number(record.source_row) || null,
        record.vigencia, record.product_group, JSON.stringify(record)];
      values.push(...tuple);
      const refs = tuple.map((_, i) => `$${p + i}`);
      p += tuple.length;
      refs[6] = `${refs[6]}::jsonb`;
      return `(${refs.join(', ')})`;
    });
    await queryDb(`INSERT INTO ${STAGING_TABLE}
      (run_id, source_file, source_sheet, source_row, vigencia, product_group, payload)
      VALUES ${tuples.join(', ')}`, values);
  }
}

const norm = (v) => String(v ?? '').trim().toUpperCase();
const conflicts = (existing, item) => FP_FIELDS.some((field) =>
  existing[field] && item[field] && norm(existing[field]) !== norm(item[field]));

function requiredFingerprintFields(item) {
  const electric = /EL[EÉ]CTRIC/i.test(item.source_sheet) || /\bEV\b/i.test(item.version) || /EL[EÉ]CTRIC/i.test(item.combustible || '');
  if (electric) return ['transmision', 'hp', 'combustible', 'traccion', 'pasajeros'];
  const commercial = /COMERCIALES|PICK\s*UP|VIEW GRAND/i.test(item.source_sheet);
  if (commercial) return ['transmision', 'cc', 'hp', 'combustible'];
  return ['transmision', 'cc', 'hp', 'combustible'];
}

function fingerprintStatus(item) {
  const required = requiredFingerprintFields(item);
  const present = required.filter((field) => item[field]).length;
  if (!present) return 'incomplete';
  return present === required.length ? 'complete' : 'partial';
}

async function getPriceVersionId(item, cache) {
  const key = `${item.marca}|${item.modelo}|${item.version}`;
  if (cache.has(key)) return cache.get(key);

  const found = await queryDb(
    `SELECT price_version_id, transmision, cc, hp, combustible, traccion, carga_kg, pasajeros, euro
       FROM price_versions WHERE marca=$1 AND modelo=$2 AND version=$3 LIMIT 1`,
    [item.marca, item.modelo, item.version],
  );

  let id;
  if (!found.length) {
    const status = fingerprintStatus(item);
    const rows = await queryDb(
      `INSERT INTO price_versions
       (marca, modelo, version, version_raw, source_sheet, activo, fingerprint_status,
        transmision, cc, hp, combustible, traccion, carga_kg, pasajeros, euro)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING price_version_id`,
      [item.marca, item.modelo, item.version, item.version_raw, item.source_sheet, status,
       item.transmision, item.cc, item.hp, item.combustible, item.traccion, item.carga_kg, item.pasajeros, item.euro],
    );
    id = rows[0].price_version_id;
  } else {
    id = found[0].price_version_id;
    const conflict = conflicts(found[0], item);
    const status = conflict ? 'conflict' : fingerprintStatus(item);
    await queryDb(
      `UPDATE price_versions SET
         activo=true,
         version_raw=COALESCE(version_raw,$2), source_sheet=COALESCE(source_sheet,$3),
         fingerprint_status=CASE WHEN fingerprint_status='conflict' THEN 'conflict' ELSE $4 END,
         transmision=COALESCE(transmision,$5), cc=COALESCE(cc,$6), hp=COALESCE(hp,$7),
         combustible=COALESCE(combustible,$8), traccion=COALESCE(traccion,$9),
         carga_kg=COALESCE(carga_kg,$10), pasajeros=COALESCE(pasajeros,$11), euro=COALESCE(euro,$12)
       WHERE price_version_id=$1`,
      [id, item.version_raw, item.source_sheet, status, item.transmision, item.cc, item.hp,
       item.combustible, item.traccion, item.carga_kg, item.pasajeros, item.euro],
    );
  }
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
       DO NOTHING RETURNING price_history_id`,
      [priceVersionId, item.vigencia_desde, item.precio_neto, item.precio_lista, item.precio_con_iva,
       item.bono_cidef, item.bono_forum, item.bono_mes, item.source_file, item.source_sheet,
       item.source_row, JSON.stringify(item.raw_payload)],
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
    const statuses = await queryDb(`SELECT fingerprint_status, count(*)::int AS n FROM price_versions GROUP BY fingerprint_status`);
    const count = (status) => statuses.find((r) => r.fingerprint_status === status)?.n || 0;
    return { runId, filesLoaded: files.length, rowsStaged: records.length,
      rowsNormalized: normalized.length, rowsRejected: records.length - normalized.length,
      ...result, fingerprintComplete: count('complete'), fingerprintPartial: count('partial'),
      fingerprintIncomplete: count('incomplete'), fingerprintConflicts: count('conflict'),
      elapsedMs: Date.now() - startedAt };
  } catch (error) {
    throw new Error(`Price import failed; staging preserved for run ${runId}: ${error.message}`);
  }
}
