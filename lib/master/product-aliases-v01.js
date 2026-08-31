import { queryDb } from '../neon.js';

const BRAND_CANON = `CASE
  WHEN master_norm(src_marca) IN ('DFM','DFLM','DONG FENG','DONGFENG','ZNA DONGFENG') THEN 'DONGFENG'
  WHEN master_norm(src_marca) IN ('LEAP MOTOR','LEAPMOTOR') THEN 'LEAPMOTOR'
  ELSE master_norm(src_marca)
END`;

async function rebuildSourceAliases(source, table, skuColumn, brandColumn) {
  const sql = `
    WITH observed AS (
      SELECT articulo AS sku, desc_mae_marca AS src_marca, desc_articulo AS nombre
      FROM ventas_raw
      WHERE master_norm(articulo) IS NOT NULL
        AND master_norm(desc_articulo) IS NOT NULL
      UNION ALL
      SELECT modelo, desc_mae_marca, modelo_comercial
      FROM notas_venta_raw
      WHERE master_norm(modelo) IS NOT NULL
        AND master_norm(modelo_comercial) IS NOT NULL
    ), normalized AS (
      SELECT
        master_norm(sku) AS sku_norm,
        ${BRAND_CANON} AS marca_norm,
        master_norm(nombre) AS nombre_norm
      FROM observed
    ), deterministic AS (
      SELECT
        sku_norm,
        min(marca_norm) AS marca_norm,
        min(nombre_norm) AS nombre_norm
      FROM normalized
      WHERE marca_norm IS NOT NULL AND nombre_norm IS NOT NULL
      GROUP BY sku_norm
      HAVING count(DISTINCT marca_norm)=1
         AND count(DISTINCT nombre_norm)=1
    ), candidates AS (
      SELECT
        d.sku_norm,
        ma.marca_id,
        mo.modelo_id,
        ve.version_id
      FROM deterministic d
      JOIN marcas_master_v01 ma ON ma.nombre_normalizado=d.marca_norm
      JOIN modelos_master_v01 mo ON mo.marca_id=ma.marca_id
      JOIN versiones_master_v01 ve
        ON ve.modelo_id=mo.modelo_id
       AND ve.nombre_normalizado=d.nombre_norm
    ), resolved AS (
      SELECT
        sku_norm,
        min(marca_id) AS marca_id,
        min(modelo_id) AS modelo_id,
        min(version_id) AS version_id
      FROM candidates
      GROUP BY sku_norm
      HAVING count(DISTINCT version_id)=1
    ), source_values AS (
      SELECT
        master_norm(${skuColumn}) AS sku_norm,
        min(trim(${skuColumn})) AS valor_raw,
        min(trim(${brandColumn})) AS contexto_marca_raw,
        count(*) AS evidencia_count
      FROM ${table}
      WHERE master_norm(${skuColumn}) IS NOT NULL
      GROUP BY master_norm(${skuColumn})
    )
    INSERT INTO producto_aliases_v01(
      nivel,fuente,valor_raw,valor_normalizado,contexto_marca_raw,
      marca_id,modelo_id,version_id,evidencia_tipo,evidencia_count,estado
    )
    SELECT
      'VERSION',$1,s.valor_raw,s.sku_norm,s.contexto_marca_raw,
      r.marca_id,r.modelo_id,r.version_id,'SKU_NOMBRE_COMERCIAL_EXACTO',s.evidencia_count,'RESUELTO'
    FROM source_values s
    JOIN resolved r USING (sku_norm)
    ON CONFLICT DO NOTHING
  `;
  await queryDb(sql, [source]);
}

export async function refreshProductAliasesV01() {
  await queryDb(`
    UPDATE producto_aliases_v01 a
    SET estado = CASE WHEN ma.nombre_normalizado='ZNA' THEN 'RESUELTO' ELSE 'AMBIGUO' END,
        updated_at = now()
    FROM marcas_master_v01 ma
    WHERE a.marca_id=ma.marca_id
      AND a.fuente='rvm_raw'
      AND a.nivel='MARCA'
      AND a.valor_normalizado='ZNA'
  `);

  await queryDb(`
    UPDATE producto_aliases_v01 a
    SET estado='AMBIGUO', updated_at=now()
    FROM modelos_master_v01 mo
    WHERE a.modelo_id=mo.modelo_id
      AND a.fuente='rvm_raw'
      AND a.nivel='MODELO'
      AND a.valor_normalizado='S50'
      AND master_norm(coalesce(a.contexto_marca_raw,''))='DFM'
      AND master_norm(coalesce(a.contexto_modelo_raw,''))='S50 EV AUT'
      AND mo.nombre_normalizado='MAGE EV'
  `);

  await queryDb(`DELETE FROM producto_aliases_v01 WHERE fuente IN ('vehiculos_raw','ventas_raw','notas_venta_raw')`);

  await rebuildSourceAliases('ventas_raw', 'ventas_raw', 'articulo', 'desc_mae_marca');
  await rebuildSourceAliases('notas_venta_raw', 'notas_venta_raw', 'modelo', 'desc_mae_marca');
  await rebuildSourceAliases('vehiculos_raw', 'vehiculos_raw', 'modelo', 'marca');

  const summary = await queryDb(`
    WITH conflicts AS (
      SELECT fuente,nivel,valor_normalizado,
             coalesce(contexto_marca_raw,'') contexto_marca_raw,
             coalesce(contexto_modelo_raw,'') contexto_modelo_raw
      FROM producto_aliases_v01
      WHERE estado='RESUELTO'
      GROUP BY 1,2,3,4,5
      HAVING count(DISTINCT coalesce(version_id,modelo_id,marca_id))>1
    )
    SELECT
      (SELECT count(*) FROM producto_aliases_v01) AS aliases_total,
      (SELECT count(*) FROM producto_aliases_v01 WHERE fuente='vehiculos_raw' AND estado='RESUELTO') AS vehiculos_aliases,
      (SELECT count(*) FROM producto_aliases_v01 WHERE fuente='ventas_raw' AND estado='RESUELTO') AS ventas_aliases,
      (SELECT count(*) FROM producto_aliases_v01 WHERE fuente='notas_venta_raw' AND estado='RESUELTO') AS notas_aliases,
      (SELECT count(*) FROM conflicts) AS aliases_resueltos_ambiguos
  `);

  return summary[0];
}
