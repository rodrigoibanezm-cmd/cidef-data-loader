export const QUALITY_CHECKS = [
  'invalid_dates', 'null_quantity', 'anomalous_quantity', 'unmapped_brands',
  'unmapped_models', 'active_without_master', 'unmapped_versions',
  'relevant_duplicates', 'missing_brand_id', 'missing_source_metadata',
];

export function qualitySql() {
  return `SELECT
    COUNT(*) FILTER (WHERE r.fecha IS NULL)::int AS invalid_dates,
    COUNT(*) FILTER (WHERE r.cantidad IS NULL)::int AS null_quantity,
    COUNT(*) FILTER (WHERE r.cantidad IS DISTINCT FROM 1)::int AS anomalous_quantity,
    COUNT(DISTINCT r.marca) FILTER (WHERE b.brand_id IS NULL)::int AS unmapped_brands,
    COUNT(DISTINCT (r.marca,r.modelo_homologado))
      FILTER (WHERE NULLIF(TRIM(r.modelo_homologado),'') IS NOT NULL AND vm.model_key IS NULL)::int AS unmapped_models,
    COUNT(DISTINCT (r.marca,r.modelo_homologado,r.modeo_version))
      FILTER (WHERE NULLIF(TRIM(r.modeo_version),'') IS NOT NULL AND vm.model_key IS NULL)::int AS unmapped_versions,
    COUNT(*) FILTER (WHERE r.documento_origen IS NULL
      OR r.fecha_creacion_documento IS NULL)::int AS missing_source_metadata
  FROM rvm_raw r LEFT JOIN brands_master b ON b.marca=r.marca
  LEFT JOIN vehicle_models_master vm ON vm.brand_id=b.brand_id
    AND vm.modelo_homologado=r.modelo_homologado`;
}

export function duplicateSql() {
  return `WITH identified AS (
    SELECT documento_origen,
      COALESCE(NULLIF(TRIM(patente),''),NULLIF(TRIM(vin),''),
        NULLIF(TRIM(n_chasis),'')) AS vehicle_id
    FROM rvm_raw
  ), duplicates AS (
    SELECT COUNT(*) AS n FROM identified
    WHERE documento_origen IS NOT NULL AND vehicle_id IS NOT NULL
    GROUP BY documento_origen,vehicle_id HAVING COUNT(*)>1
  ) SELECT COALESCE(SUM(n-1),0)::int AS count FROM duplicates`;
}
