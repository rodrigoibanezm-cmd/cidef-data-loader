import { randomUUID } from 'node:crypto';
import { listFilesInFolder, downloadFile } from '../drive.js';
import { parsePriceWorkbook } from '../price-list.js';
import { normalizePriceRecord } from '../price-normalizer.js';
import { queryDb } from '../neon.js';

const STAGING_TABLE = 'price_import_staging';
const FP_FIELDS = ['transmision', 'cc', 'hp', 'combustible', 'traccion', 'carga_kg', 'pasajeros', 'euro'];
const VERSION_BATCH_SIZE = 100;
const HISTORY_BATCH_SIZE = 300;

async function ensurePriceSchema() {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS price_import_staging (
      id bigserial PRIMARY KEY,
      run_id text NOT NULL,
      source_file text,
      source_sheet text,
      source_row integer,
      vigencia text,
      product_group text,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await queryDb(`
    CREATE TABLE IF NOT EXISTS price_versions (
      price_version_id bigserial PRIMARY KEY,
      marca text NOT NULL,
      modelo text NOT NULL,
      version text NOT NULL,
      version_raw text,
      source_sheet text,
      activo boolean NOT NULL DEFAULT true,
      fingerprint_status text NOT NULL DEFAULT 'incomplete',
      transmision text,
      cc text,
      hp text,
      combustible text,
      traccion text,
      carga_kg text,
      pasajeros text,
      euro text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT price_versions_identity_uk UNIQUE (marca, modelo, version)
    )
  `);

  await queryDb(`
    CREATE TABLE IF NOT EXISTS price_history (
      price_history_id bigserial PRIMARY KEY,
      price_version_id bigint NOT NULL REFERENCES price_versions(price_version_id),
      vigencia_desde date NOT NULL,
      precio_neto bigint,
      precio_lista bigint,
      precio_con_iva bigint,
      bono_cidef bigint,
      bono_forum bigint,
      bono_mes bigint,
      source_file text NOT NULL,
      source_sheet text NOT NULL,
      source_row integer NOT NULL,
      raw_payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT price_history_source_uk UNIQUE (
        price_version_id, vigencia_desde, source_file, source_sheet, source_row
      )
    )
  `);

  await queryDb(`CREATE INDEX IF NOT EXISTS price_import_staging_run_idx ON price_import_staging(run_id)`);
  await queryDb(`CREATE INDEX IF NOT EXISTS price_versions_brand_active_idx ON price_versions(marca, activo)`);
  await queryDb(`CREATE INDEX IF NOT EXISTS price_history_lookup_idx ON price_history(price_version_id, vigencia_desde DESC, created_at DESC)`);
}

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

async function loadAllStagedRecords(runId) {
  const rows = await queryDb(
    `SELECT id, payload, source_file
       FROM ${STAGING_TABLE}
      WHERE run_id = $1
      ORDER BY id`,
    [runId],
  );
  if (!rows.length) throw new Error(`No staged price records found for run ${runId}`);
  return {
    records: rows.map((row) => row.payload),
    filesLoaded: new Set(rows.map((row) => row.source_file).filter(Boolean)).size,
  };
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
         carga_kg=COALESCE(carga_kg,$10), pasajeros=COALESCE(pasajeros,$11), euro=COALESCE(euro,$12),
         updated_at=now()
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

function mergeVersionCandidates(items) {
  const grouped = new Map();
  for (const item of items) {
    const key = `${item.marca}|${item.modelo}|${item.version}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...item, fingerprint_status: fingerprintStatus(item) });
      continue;
    }
    const hasConflict = current.fingerprint_status === 'conflict' || conflicts(current, item);
    for (const field of FP_FIELDS) {
      if (!current[field] && item[field]) current[field] = item[field];
    }
    if (!current.version_raw && item.version_raw) current.version_raw = item.version_raw;
    if (!current.source_sheet && item.source_sheet) current.source_sheet = item.source_sheet;
    current.fingerprint_status = hasConflict ? 'conflict' : fingerprintStatus(current);
  }
  return [...grouped.values()];
}

function sqlFingerprintConflict() {
  return FP_FIELDS.map((field) =>
    `(price_versions.${field} IS NOT NULL AND EXCLUDED.${field} IS NOT NULL AND UPPER(TRIM(price_versions.${field})) <> UPPER(TRIM(EXCLUDED.${field})))`
  ).join(' OR ');
}

async function upsertVersionsBulk(items) {
  const candidates = mergeVersionCandidates(items);
  const idByKey = new Map();
  const conflictSql = sqlFingerprintConflict();

  for (let offset = 0; offset < candidates.length; offset += VERSION_BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + VERSION_BATCH_SIZE);
    const values = [];
    let p = 1;
    const tuples = batch.map((item) => {
      const tuple = [item.marca, item.modelo, item.version, item.version_raw, item.source_sheet,
        item.fingerprint_status, item.transmision, item.cc, item.hp, item.combustible,
        item.traccion, item.carga_kg, item.pasajeros, item.euro];
      values.push(...tuple);
      const refs = tuple.map((_, i) => `$${p + i}`);
      p += tuple.length;
      return `(${refs[0]},${refs[1]},${refs[2]},${refs[3]},${refs[4]},true,${refs[5]},${refs[6]},${refs[7]},${refs[8]},${refs[9]},${refs[10]},${refs[11]},${refs[12]},${refs[13]})`;
    });

    const rows = await queryDb(
      `INSERT INTO price_versions
       (marca, modelo, version, version_raw, source_sheet, activo, fingerprint_status,
        transmision, cc, hp, combustible, traccion, carga_kg, pasajeros, euro)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (marca, modelo, version) DO UPDATE SET
         activo=true,
         version_raw=COALESCE(price_versions.version_raw, EXCLUDED.version_raw),
         source_sheet=COALESCE(price_versions.source_sheet, EXCLUDED.source_sheet),
         fingerprint_status=CASE
           WHEN price_versions.fingerprint_status='conflict'
             OR EXCLUDED.fingerprint_status='conflict'
             OR ${conflictSql}
           THEN 'conflict'
           ELSE EXCLUDED.fingerprint_status
         END,
         transmision=COALESCE(price_versions.transmision, EXCLUDED.transmision),
         cc=COALESCE(price_versions.cc, EXCLUDED.cc),
         hp=COALESCE(price_versions.hp, EXCLUDED.hp),
         combustible=COALESCE(price_versions.combustible, EXCLUDED.combustible),
         traccion=COALESCE(price_versions.traccion, EXCLUDED.traccion),
         carga_kg=COALESCE(price_versions.carga_kg, EXCLUDED.carga_kg),
         pasajeros=COALESCE(price_versions.pasajeros, EXCLUDED.pasajeros),
         euro=COALESCE(price_versions.euro, EXCLUDED.euro),
         updated_at=now()
       RETURNING price_version_id, marca, modelo, version`,
      values,
    );

    for (const row of rows) {
      idByKey.set(`${row.marca}|${row.modelo}|${row.version}`, row.price_version_id);
    }
  }

  return { idByKey, versionsTouched: candidates.length };
}

async function insertHistoryBulk(items, idByKey) {
  let historyInserted = 0;
  let batchesProcessed = 0;

  for (let offset = 0; offset < items.length; offset += HISTORY_BATCH_SIZE) {
    const batch = items.slice(offset, offset + HISTORY_BATCH_SIZE);
    const values = [];
    let p = 1;
    const tuples = batch.map((item) => {
      const priceVersionId = idByKey.get(`${item.marca}|${item.modelo}|${item.version}`);
      if (!priceVersionId) throw new Error(`Missing price_version_id for ${item.marca}/${item.modelo}/${item.version}`);
      const tuple = [priceVersionId, item.vigencia_desde, item.precio_neto, item.precio_lista,
        item.precio_con_iva, item.bono_cidef, item.bono_forum, item.bono_mes,
        item.source_file, item.source_sheet, item.source_row, JSON.stringify(item.raw_payload)];
      values.push(...tuple);
      const refs = tuple.map((_, i) => `$${p + i}`);
      p += tuple.length;
      refs[11] = `${refs[11]}::jsonb`;
      return `(${refs.join(', ')})`;
    });

    const rows = await queryDb(
      `INSERT INTO price_history (
         price_version_id, vigencia_desde, precio_neto, precio_lista, precio_con_iva,
         bono_cidef, bono_forum, bono_mes, source_file, source_sheet, source_row, raw_payload
       ) VALUES ${tuples.join(', ')}
       ON CONFLICT (price_version_id, vigencia_desde, source_file, source_sheet, source_row)
       DO NOTHING RETURNING price_history_id`,
      values,
    );
    historyInserted += rows.length;
    batchesProcessed += 1;
  }

  return { historyInserted, batchesProcessed };
}

async function persistCanonicalBulk(items) {
  if (!items.length) return { versionsTouched: 0, historyInserted: 0, batchesProcessed: 0 };
  const versions = await upsertVersionsBulk(items);
  const history = await insertHistoryBulk(items, versions.idByKey);
  return {
    versionsTouched: versions.versionsTouched,
    historyInserted: history.historyInserted,
    batchesProcessed: history.batchesProcessed,
  };
}

async function fingerprintCounts() {
  const statuses = await queryDb(`SELECT fingerprint_status, count(*)::int AS n FROM price_versions GROUP BY fingerprint_status`);
  const count = (status) => statuses.find((r) => r.fingerprint_status === status)?.n || 0;
  return {
    fingerprintComplete: count('complete'),
    fingerprintPartial: count('partial'),
    fingerprintIncomplete: count('incomplete'),
    fingerprintConflicts: count('conflict'),
  };
}

export async function run(input = {}) {
  const startedAt = Date.now();
  await ensurePriceSchema();

  const resumeRunId = typeof input?.resume_run_id === 'string' ? input.resume_run_id.trim() : '';

  if (resumeRunId) {
    try {
      const staged = await loadAllStagedRecords(resumeRunId);
      const normalized = staged.records.map(normalizePriceRecord).filter(Boolean);
      const result = await persistCanonicalBulk(normalized);

      await queryDb(`DELETE FROM ${STAGING_TABLE} WHERE run_id = $1`, [resumeRunId]);

      return {
        runId: resumeRunId,
        resumed: true,
        mode: 'INTERNAL_LOOP_BULK',
        filesLoaded: staged.filesLoaded,
        rowsStaged: staged.records.length,
        rowsNormalized: normalized.length,
        rowsRejected: staged.records.length - normalized.length,
        ...result,
        remainingRows: 0,
        complete: true,
        ...(await fingerprintCounts()),
        elapsedMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw new Error(`Price import resume failed; staging preserved for run ${resumeRunId}: ${error.message}`);
    }
  }

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
      resumed: false,
      filesLoaded: files.length,
      rowsStaged: records.length,
      rowsNormalized: normalized.length,
      rowsRejected: records.length - normalized.length,
      ...result,
      ...(await fingerprintCounts()),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    throw new Error(`Price import failed; staging preserved for run ${runId}: ${error.message}`);
  }
}
