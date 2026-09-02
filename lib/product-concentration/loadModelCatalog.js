import { customGptDb } from '../custom-gpt/db.js';

export const MODEL_CATALOG_SQL = `
  SELECT
    mo.modelo_id,
    mo.nombre_canonico AS modelo,
    ma.marca_id,
    ma.nombre_canonico AS marca
  FROM modelos_master_v01 mo
  JOIN marcas_master_v01 ma ON ma.marca_id = mo.marca_id
`;

export async function loadModelCatalog(sql = customGptDb()) {
  return sql.query(MODEL_CATALOG_SQL);
}
