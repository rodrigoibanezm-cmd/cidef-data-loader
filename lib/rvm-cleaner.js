import { neon } from '@neondatabase/serverless';

const FINAL = 'rvm_raw';
const STAGE = 'rvm_stage_raw';
const KEEP = [
  'ano','mes','dia','tipo','descripcion_segmento','marca','modelo_homologado','modeo_version',
  'ano_fabricacion','combustible','comuna_adquisicion','region_propietario','prenda','vin',
  'n_chasis','patente','calidad','pais_vin','preinscrito','cantidad'
];

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}
const qi = (v) => `"${String(v).replace(/"/g, '""')}"`;

export async function ensureFinalSchema() {
  const sql = db();
  await sql.query(`ALTER TABLE ${FINAL} ADD COLUMN IF NOT EXISTS documento_origen text`);
  await sql.query(`ALTER TABLE ${FINAL} ADD COLUMN IF NOT EXISTS fecha_creacion_documento timestamptz`);
  await sql.query(`ALTER TABLE ${FINAL} ADD COLUMN IF NOT EXISTS fecha_ingesta timestamptz`);
  await sql.query(`ALTER TABLE ${FINAL} ADD COLUMN IF NOT EXISTS source_row integer`);
  await sql.query(`UPDATE ${FINAL} SET documento_origen='RVM_'||ano||'.xlsx' WHERE documento_origen IS NULL`);
}

export async function documentLoaded(name) {
  const sql = db();
  const [r] = await sql.query(`SELECT EXISTS(SELECT 1 FROM ${FINAL} WHERE documento_origen=$1) AS loaded`, [name]);
  return r.loaded;
}

export async function resetStage() {
  const sql = db();
  await sql.query(`DROP TABLE IF EXISTS ${STAGE}`);
  await sql.query(`CREATE TABLE ${STAGE} (mercado text, source_row integer, ${KEEP.map(c => `${qi(c)} text`).join(',')})`);
}

export async function appendStage(rows) {
  if (!rows.length) return;
  const sql = db();
  const cols = ['mercado','source_row',...KEEP];
  const values = [];
  let p = 1;
  const tuples = rows.map(row => `(${row.map(v => { values.push(v); return `$${p++}`; }).join(',')})`);
  await sql.query(`INSERT INTO ${STAGE} (${cols.map(qi).join(',')}) VALUES ${tuples.join(',')}`, values);
}

export async function normalizeAndAppend(file) {
  const sql = db();
  await sql.query(`
    INSERT INTO ${FINAL} (${KEEP.map(qi).join(',')},fecha,documento_origen,fecha_creacion_documento,fecha_ingesta,source_row)
    SELECT
      NULLIF(trim(ano),'')::int,NULLIF(trim(mes),'')::int,NULLIF(trim(dia),'')::int,
      upper(trim(tipo)),upper(trim(descripcion_segmento)),upper(trim(marca)),upper(trim(modelo_homologado)),upper(trim(modeo_version)),
      CASE WHEN trim(ano_fabricacion)~'^\\d{4}$' THEN trim(ano_fabricacion)::int END,
      upper(trim(combustible)),upper(regexp_replace(trim(comuna_adquisicion),'\\s+',' ','g')),
      upper(regexp_replace(trim(region_propietario),'\\s+',' ','g')),upper(trim(prenda)),upper(trim(vin)),upper(trim(n_chasis)),
      upper(trim(patente)),upper(trim(calidad)),upper(trim(pais_vin)),upper(trim(preinscrito)),
      CASE WHEN trim(cantidad)~'^-?\\d+$' THEN trim(cantidad)::int END,
      make_date(trim(ano)::int,trim(mes)::int,trim(dia)::int),$1,$2::timestamptz,now(),source_row
    FROM ${STAGE}
    WHERE trim(mercado)='Livianos y Medianos'
  `, [file.name, file.createdTime ?? file.modifiedTime ?? null]);
  const [{ count }] = await sql.query(`SELECT COUNT(*)::int AS count FROM ${FINAL} WHERE documento_origen=$1`, [file.name]);
  await sql.query(`DROP TABLE IF EXISTS ${STAGE}`);
  return Number(count);
}

export { KEEP };
