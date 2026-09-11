import { neon } from '@neondatabase/serverless';
import XLSX from 'xlsx';
import { listFilesInFolder, downloadFile } from '../drive.js';
import { run as canonicalizeForum } from './forum-canonicalizer-v01.js';

const TABLE_NAME = 'forum_raw';
const FILE_PATTERN = /^Base clientes cotizados CIDEF.*\.(?:xlsx|xls)$/i;
const BATCH_SIZE = 250;

const SOURCE_COLUMNS = [
  'Rut',
  'NumOperacion',
  'NombreCompleto',
  'EstadoFinalRevision',
  'EstadoFinal',
  'FechaCotizacion',
  'MarcaVehiculo',
  'ModeloVehiculo',
  'EstadoVehiculo',
  'Distribuidor',
  'Sucursal',
  'Vendedor',
  'Ejecutivo',
];

const TARGET_COLUMNS = [
  'numero_operacion',
  'rut',
  'nombre_completo',
  'estado_final_revision',
  'estado_final',
  'fecha_cotizacion',
  'marca_vehiculo',
  'modelo_vehiculo',
  'estado_vehiculo',
  'distribuidor',
  'sucursal',
  'vendedor',
  'ejecutivo',
  'source_file',
  'source_file_id',
  'loaded_at',
];

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

function normalizeOperation(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim().replace(/\.0+$/, '');
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid NumOperacion: ${value}`);
  return raw;
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) throw new Error(`Invalid FechaCotizacion: ${value}`);
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S))).toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`Invalid FechaCotizacion: ${value}`);
  return parsed.toISOString();
}

export function parseForumWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Forum workbook has no worksheets');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true });
  if (!rows.length) return { rows: [], rowsRead: 0, duplicateOperations: 0 };

  const headers = new Set(Object.keys(rows[0]));
  const missing = SOURCE_COLUMNS.filter((column) => !headers.has(column));
  if (missing.length) throw new Error(`Forum workbook is missing required columns: ${missing.join(', ')}`);

  const byOperation = new Map();
  let duplicateOperations = 0;
  rows.forEach((row, index) => {
    const numeroOperacion = normalizeOperation(row.NumOperacion);
    if (!numeroOperacion) throw new Error(`Forum workbook has empty NumOperacion at data row ${index + 2}`);
    if (byOperation.has(numeroOperacion)) duplicateOperations++;
    byOperation.set(numeroOperacion, {
      numero_operacion: numeroOperacion,
      rut: normalizeText(row.Rut),
      nombre_completo: normalizeText(row.NombreCompleto),
      estado_final_revision: normalizeText(row.EstadoFinalRevision),
      estado_final: normalizeText(row.EstadoFinal),
      fecha_cotizacion: normalizeDate(row.FechaCotizacion),
      marca_vehiculo: normalizeText(row.MarcaVehiculo),
      modelo_vehiculo: normalizeText(row.ModeloVehiculo),
      estado_vehiculo: normalizeText(row.EstadoVehiculo),
      distribuidor: normalizeText(row.Distribuidor),
      sucursal: normalizeText(row.Sucursal),
      vendedor: normalizeText(row.Vendedor),
      ejecutivo: normalizeText(row.Ejecutivo),
    });
  });

  return { rows: [...byOperation.values()], rowsRead: rows.length, duplicateOperations };
}

async function ensureSchema(sql) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS public.${TABLE_NAME} (
      numero_operacion bigint PRIMARY KEY,
      rut text,
      nombre_completo text,
      estado_final_revision text,
      estado_final text,
      fecha_cotizacion timestamp,
      marca_vehiculo text,
      modelo_vehiculo text,
      estado_vehiculo text,
      distribuidor text,
      sucursal text,
      vendedor text,
      ejecutivo text,
      source_file text NOT NULL,
      source_file_id text,
      loaded_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function upsertRows(sql, rows, file, loadedAt) {
  if (!rows.length) return 0;
  let loaded = 0;
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const values = [];
    let p = 1;
    const tuples = batch.map((row) => {
      const ordered = [
        row.numero_operacion,
        row.rut,
        row.nombre_completo,
        row.estado_final_revision,
        row.estado_final,
        row.fecha_cotizacion,
        row.marca_vehiculo,
        row.modelo_vehiculo,
        row.estado_vehiculo,
        row.distribuidor,
        row.sucursal,
        row.vendedor,
        row.ejecutivo,
        file.name,
        file.id,
        loadedAt,
      ];
      return `(${ordered.map((value) => { values.push(value); return `$${p++}`; }).join(',')})`;
    });

    const updates = TARGET_COLUMNS
      .filter((column) => column !== 'numero_operacion')
      .map((column) => `${column}=EXCLUDED.${column}`)
      .join(',');

    await sql.query(
      `INSERT INTO public.${TABLE_NAME} (${TARGET_COLUMNS.join(',')})
       VALUES ${tuples.join(',')}
       ON CONFLICT (numero_operacion) DO UPDATE SET ${updates}`,
      values,
    );
    loaded += batch.length;
  }
  return loaded;
}

function selectLatestFile(files) {
  return [...files].sort((a, b) => {
    const aTime = Date.parse(a.modifiedTime || a.createdTime || 0) || 0;
    const bTime = Date.parse(b.modifiedTime || b.createdTime || 0) || 0;
    if (aTime !== bTime) return bTime - aTime;
    return String(b.name).localeCompare(String(a.name));
  })[0] ?? null;
}

export async function run(input = {}) {
  const startedAt = Date.now();
  const files = (await listFilesInFolder('Base clientes cotizados CIDEF'))
    .filter((file) => FILE_PATTERN.test(file.name));
  const file = input.fileName
    ? files.find((candidate) => candidate.name === input.fileName)
    : selectLatestFile(files);
  if (!file) throw new Error(`Forum file not found${input.fileName ? `: ${input.fileName}` : ''}`);

  const parsed = parseForumWorkbook(await downloadFile(file.id));
  const sql = db();
  await ensureSchema(sql);
  const loadedAt = new Date().toISOString();

  await sql.query('BEGIN');
  try {
    await upsertRows(sql, parsed.rows, file, loadedAt);
    await sql.query('COMMIT');
  } catch (error) {
    await sql.query('ROLLBACK');
    throw error;
  }

  const [post] = await sql.query(`
    SELECT COUNT(*)::int AS total_rows,
           MIN(fecha_cotizacion)::text AS min_date,
           MAX(fecha_cotizacion)::text AS max_date
    FROM public.${TABLE_NAME}
  `);

  const canonical = input.skipCanonicalize === true ? null : await canonicalizeForum();

  return {
    table: TABLE_NAME,
    strategy: 'UPSERT_BY_NUMERO_OPERACION',
    source_file: file.name,
    rows_read: parsed.rowsRead,
    duplicate_operations_removed: parsed.duplicateOperations,
    unique_operations_loaded: parsed.rows.length,
    total_rows: Number(post.total_rows),
    min_date: post.min_date,
    max_date: post.max_date,
    canonical,
    elapsed_ms: Date.now() - startedAt,
  };
}
