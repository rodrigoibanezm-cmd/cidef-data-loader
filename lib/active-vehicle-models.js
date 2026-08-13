import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

export async function refreshActiveVehicleModels() {
  const sql = db();

  await sql.query(`
    CREATE TABLE IF NOT EXISTS active_vehicle_models_history (
      year_month text NOT NULL,
      model_key bigint NOT NULL REFERENCES vehicle_models_master(model_key),
      brand_id bigint NOT NULL REFERENCES brands_master(brand_id),
      marca text NOT NULL,
      modelo_homologado text NOT NULL,
      segmento text NOT NULL,
      microsegmento text,
      unidades_mes numeric NOT NULL,
      refreshed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (year_month, model_key)
    )
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS active_vehicle_models (
      year_month text NOT NULL,
      model_key bigint PRIMARY KEY REFERENCES vehicle_models_master(model_key),
      brand_id bigint NOT NULL REFERENCES brands_master(brand_id),
      marca text NOT NULL,
      modelo_homologado text NOT NULL,
      segmento text NOT NULL,
      microsegmento text,
      unidades_mes numeric NOT NULL,
      refreshed_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const [latest] = await sql.query(`
    SELECT to_char(date_trunc('month', MAX(fecha)), 'YYYY-MM') AS year_month
    FROM rvm_raw
    WHERE fecha IS NOT NULL
  `);
  if (!latest?.year_month) throw new Error('rvm_raw has no dated rows');

  const ym = latest.year_month;
  await sql.query(`DELETE FROM active_vehicle_models_history WHERE year_month=$1`, [ym]);
  await sql.query(`
    INSERT INTO active_vehicle_models_history
      (year_month, model_key, brand_id, marca, modelo_homologado, segmento, microsegmento, unidades_mes, refreshed_at)
    SELECT
      $1,
      vm.model_key,
      vm.brand_id,
      b.marca,
      vm.modelo_homologado,
      vm.segmento,
      vm.microsegmento,
      SUM(r.cantidad)::numeric,
      now()
    FROM rvm_raw r
    JOIN brands_master b ON b.marca = r.marca
    JOIN vehicle_models_master vm
      ON vm.brand_id = b.brand_id
     AND vm.modelo_homologado = r.modelo_homologado
    WHERE to_char(date_trunc('month', r.fecha), 'YYYY-MM') = $1
    GROUP BY vm.model_key, vm.brand_id, b.marca, vm.modelo_homologado, vm.segmento, vm.microsegmento
    HAVING SUM(r.cantidad) > 0
  `, [ym]);

  await sql.query(`TRUNCATE active_vehicle_models`);
  await sql.query(`
    INSERT INTO active_vehicle_models
      (year_month, model_key, brand_id, marca, modelo_homologado, segmento, microsegmento, unidades_mes, refreshed_at)
    SELECT year_month, model_key, brand_id, marca, modelo_homologado, segmento, microsegmento, unidades_mes, refreshed_at
    FROM active_vehicle_models_history
    WHERE year_month=$1
  `, [ym]);

  const [result] = await sql.query(`
    SELECT $1::text AS year_month,
           COUNT(*)::int AS active_models,
           COUNT(DISTINCT brand_id)::int AS active_brands
    FROM active_vehicle_models
  `, [ym]);

  return result;
}
