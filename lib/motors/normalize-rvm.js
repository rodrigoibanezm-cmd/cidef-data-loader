import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

export async function run() {
  const sql = db();

  await sql.query(`DROP TABLE IF EXISTS rvm_normalized__loading`);
  await sql.query(`
    CREATE TABLE rvm_normalized__loading AS
    SELECT
      r.*,
      CASE
        WHEN trim(ano) ~ '^\\d{4}$' AND trim(mes) ~ '^\\d{1,2}$' AND trim(dia) ~ '^\\d{1,2}$'
        THEN make_date(trim(ano)::int, trim(mes)::int, trim(dia)::int)
        ELSE NULL
      END AS fecha,
      CASE WHEN trim(ano) ~ '^\\d{4}$' AND trim(mes) ~ '^\\d{1,2}$'
        THEN trim(ano) || '-' || lpad(trim(mes), 2, '0') END AS year_month,
      upper(nullif(trim(marca), '')) AS marca_norm,
      upper(nullif(trim(modelo_homologado), '')) AS modelo_norm,
      upper(nullif(trim(modeo_version), '')) AS version_norm,
      upper(nullif(trim(combustible), '')) AS combustible_norm,
      upper(nullif(regexp_replace(trim(region), '\\s+', ' ', 'g'), '')) AS region_norm,
      upper(nullif(regexp_replace(trim(comuna_adquisicion), '\\s+', ' ', 'g'), '')) AS comuna_norm,
      upper(nullif(regexp_replace(trim(region_propietario), '\\s+', ' ', 'g'), '')) AS region_propietario_norm,
      upper(nullif(trim(patente), '')) AS patente_norm,
      upper(nullif(trim(n_chasis), '')) AS chasis_norm,
      upper(nullif(trim(vin), '')) AS vin_norm,
      upper(nullif(trim(n_motor), '')) AS motor_norm,
      CASE WHEN trim(cantidad) ~ '^-?\\d+(\\.\\d+)?$' THEN trim(cantidad)::numeric END AS cantidad_num,
      CASE WHEN trim(ano_fabricacion) ~ '^\\d{4}$' THEN trim(ano_fabricacion)::int END AS ano_fabricacion_num,
      (CASE WHEN trim(cantidad) ~ '^-?\\d+(\\.\\d+)?$' THEN trim(cantidad)::numeric END IS DISTINCT FROM 1) AS quality_cantidad_anomala,
      (CASE WHEN trim(ano_fabricacion) ~ '^\\d{4}$' THEN trim(ano_fabricacion)::int END NOT BETWEEN 1980 AND 2030) AS quality_ano_fabricacion_anomalo
    FROM rvm_raw r
  `);

  await sql.query(`CREATE INDEX rvm_norm_fecha_idx ON rvm_normalized__loading (fecha)`);
  await sql.query(`CREATE INDEX rvm_norm_marca_idx ON rvm_normalized__loading (marca_norm)`);
  await sql.query(`CREATE INDEX rvm_norm_region_idx ON rvm_normalized__loading (region_norm)`);
  await sql.query(`CREATE INDEX rvm_norm_chasis_idx ON rvm_normalized__loading (chasis_norm)`);

  await sql.query(`DROP TABLE IF EXISTS rvm_normalized`);
  await sql.query(`ALTER TABLE rvm_normalized__loading RENAME TO rvm_normalized`);

  const [result] = await sql.query(`
    SELECT count(*)::int AS rows,
           count(*) FILTER (WHERE quality_cantidad_anomala)::int AS cantidad_anomala,
           count(*) FILTER (WHERE quality_ano_fabricacion_anomalo)::int AS ano_fabricacion_anomalo,
           count(*) FILTER (WHERE fecha IS NULL)::int AS fecha_invalida
    FROM rvm_normalized
  `);

  return { table: 'rvm_normalized', ...result };
}
