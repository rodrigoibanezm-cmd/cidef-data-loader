import { rvmDb } from '../rvm-db.js';

export async function run() {
  const sql = rvmDb();
  const [{ mapped }] = await sql.query(`
    SELECT COUNT(*)::int AS mapped FROM (
      SELECT DISTINCT b.brand_id, r.modelo_homologado
      FROM rvm_raw r JOIN brands_master b ON b.marca=r.marca
      WHERE NULLIF(TRIM(r.modelo_homologado),'') IS NOT NULL
    ) x
  `);
  const created = await sql.query(`
    INSERT INTO vehicle_models_master (brand_id, modelo_homologado, segmento)
    SELECT DISTINCT b.brand_id, r.modelo_homologado,
      CASE WHEN r.descripcion_segmento='CAMIONETA' THEN 'PICK-UP'
           ELSE r.descripcion_segmento END
    FROM rvm_raw r JOIN brands_master b ON b.marca=r.marca
    WHERE NULLIF(TRIM(r.modelo_homologado),'') IS NOT NULL
    ON CONFLICT (brand_id, modelo_homologado) DO NOTHING
    RETURNING model_key
  `);
  const pendingRows = await sql.query(`
    SELECT DISTINCT r.marca FROM rvm_raw r
    LEFT JOIN brands_master b ON b.marca=r.marca
    WHERE b.brand_id IS NULL ORDER BY r.marca
  `);
  return {
    created_models: created.length,
    existing_models: Number(mapped) - created.length,
    pending_brands: pendingRows.length,
    pending_brand_rows: pendingRows,
  };
}
