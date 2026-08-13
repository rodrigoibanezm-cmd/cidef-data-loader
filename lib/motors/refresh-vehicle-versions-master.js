import { rvmDb } from '../rvm-db.js';

async function ensureTable(sql) {
  await sql.query(`CREATE TABLE IF NOT EXISTS vehicle_versions_master (
    version_id bigserial PRIMARY KEY,
    model_key bigint NOT NULL REFERENCES vehicle_models_master(model_key),
    version_name text NOT NULL, combustible text, electrificacion text,
    activa boolean NOT NULL DEFAULT true,
    UNIQUE (model_key, version_name)
  )`);
}

export async function run() {
  const sql = rvmDb();
  await ensureTable(sql);
  const updated = await sql.query(`
    UPDATE vehicle_versions_master v SET combustible=r.combustible
    FROM (SELECT vm.model_key, r.modeo_version,
        CASE WHEN COUNT(DISTINCT r.combustible)=1 THEN MAX(r.combustible) END AS combustible
      FROM rvm_raw r JOIN brands_master b ON b.marca=r.marca
      JOIN vehicle_models_master vm ON vm.brand_id=b.brand_id
        AND vm.modelo_homologado=r.modelo_homologado
      WHERE NULLIF(TRIM(r.modeo_version),'') IS NOT NULL AND r.combustible IS NOT NULL
      GROUP BY vm.model_key, r.modeo_version) r
    WHERE v.model_key=r.model_key AND v.version_name=r.modeo_version
      AND v.combustible IS NULL AND r.combustible IS NOT NULL
    RETURNING v.version_id
  `);
  const created = await sql.query(`
    INSERT INTO vehicle_versions_master (model_key, version_name, combustible)
    SELECT vm.model_key, r.modeo_version,
      CASE WHEN COUNT(DISTINCT r.combustible)=1 THEN MAX(r.combustible) END
    FROM rvm_raw r JOIN brands_master b ON b.marca=r.marca
    JOIN vehicle_models_master vm ON vm.brand_id=b.brand_id
      AND vm.modelo_homologado=r.modelo_homologado
    WHERE NULLIF(TRIM(r.modeo_version),'') IS NOT NULL
    GROUP BY vm.model_key, r.modeo_version
    ON CONFLICT (model_key, version_name) DO NOTHING RETURNING version_id
  `);
  const [{ count }] = await sql.query(`SELECT COUNT(*)::int AS count FROM (
    SELECT DISTINCT r.marca,r.modelo_homologado,r.modeo_version FROM rvm_raw r
    LEFT JOIN brands_master b ON b.marca=r.marca
    LEFT JOIN vehicle_models_master vm ON vm.brand_id=b.brand_id
      AND vm.modelo_homologado=r.modelo_homologado
    WHERE NULLIF(TRIM(r.modeo_version),'') IS NOT NULL AND vm.model_key IS NULL
  ) x`);
  return { created_versions: created.length, updated_versions: updated.length, pending_versions: Number(count) };
}
