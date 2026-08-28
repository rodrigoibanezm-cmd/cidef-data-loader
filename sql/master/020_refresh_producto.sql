BEGIN;

WITH observed AS (
  SELECT marca FROM vehiculos_raw UNION SELECT desc_mae_marca FROM ventas_raw UNION SELECT desc_mae_marca FROM notas_venta_raw
), clean AS (
  SELECT min(trim(marca)) nombre, master_norm(marca) norm FROM observed WHERE master_norm(marca) IS NOT NULL GROUP BY 2
)
INSERT INTO marcas_master(nombre_canonico,nombre_normalizado)
SELECT nombre,norm FROM clean ON CONFLICT(nombre_normalizado) DO NOTHING;

WITH observed AS (
  SELECT articulo sku, desc_mae_marca marca, desc_articulo nombre FROM ventas_raw
  UNION ALL SELECT modelo, desc_mae_marca, modelo_comercial FROM notas_venta_raw
), safe AS (
  SELECT master_norm(sku) sku, master_norm(marca) marca, master_norm(nombre) nombre,
         min(trim(nombre)) nombre_raw
  FROM observed WHERE master_norm(sku) IS NOT NULL AND master_norm(marca) IS NOT NULL AND master_norm(nombre) IS NOT NULL
  GROUP BY 1,2,3
), unique_sku AS (
  SELECT sku, min(marca) marca, min(nombre) nombre, min(nombre_raw) nombre_raw
  FROM safe GROUP BY sku HAVING count(DISTINCT marca)=1 AND count(DISTINCT nombre)=1
)
INSERT INTO modelos_master(marca_id,nombre_canonico,nombre_normalizado)
SELECT DISTINCT m.marca_id,u.nombre_raw,u.nombre FROM unique_sku u JOIN marcas_master m ON m.nombre_normalizado=u.marca
ON CONFLICT(marca_id,nombre_normalizado) DO NOTHING;

WITH observed AS (
 SELECT modelo sku, marca, NULL::text nombre FROM vehiculos_raw
 UNION ALL SELECT articulo, desc_mae_marca, desc_articulo FROM ventas_raw
 UNION ALL SELECT modelo, desc_mae_marca, modelo_comercial FROM notas_venta_raw
), agg AS (
 SELECT master_norm(sku) sku, min(trim(sku)) sku_raw,
        min(master_norm(marca)) marca, min(master_norm(nombre)) nombre,
        count(DISTINCT master_norm(marca)) FILTER(WHERE master_norm(marca) IS NOT NULL) marcas,
        count(DISTINCT master_norm(nombre)) FILTER(WHERE master_norm(nombre) IS NOT NULL) nombres
 FROM observed WHERE master_norm(sku) IS NOT NULL GROUP BY 1
)
INSERT INTO versiones_master(marca_id,modelo_id,codigo_canonico,codigo_normalizado,descripcion_canonica)
SELECT ma.marca_id, CASE WHEN a.nombres=1 THEN mo.modelo_id END, a.sku_raw,a.sku,
       CASE WHEN a.nombres=1 THEN a.nombre END
FROM agg a JOIN marcas_master ma ON ma.nombre_normalizado=a.marca
LEFT JOIN modelos_master mo ON mo.marca_id=ma.marca_id AND mo.nombre_normalizado=a.nombre
WHERE a.marcas=1
ON CONFLICT(codigo_normalizado) DO NOTHING;

WITH src AS (
 SELECT 'vehiculos_raw' fuente, modelo valor FROM vehiculos_raw
 UNION ALL SELECT 'ventas_raw', articulo FROM ventas_raw
 UNION ALL SELECT 'notas_venta_raw', modelo FROM notas_venta_raw
)
INSERT INTO producto_aliases(nivel,version_id,fuente,valor_raw,valor_normalizado,match_method,confidence,validated)
SELECT 'version',v.version_id,s.fuente,min(trim(s.valor)),master_norm(s.valor),'sku_exact',1,true
FROM src s JOIN versiones_master v ON v.codigo_normalizado=master_norm(s.valor)
WHERE master_norm(s.valor) IS NOT NULL GROUP BY v.version_id,s.fuente,master_norm(s.valor)
ON CONFLICT(nivel,fuente,valor_normalizado) DO NOTHING;

WITH observed AS (
 SELECT modelo sku, marca, NULL::text nombre FROM vehiculos_raw
 UNION ALL SELECT articulo, desc_mae_marca, desc_articulo FROM ventas_raw
 UNION ALL SELECT modelo, desc_mae_marca, modelo_comercial FROM notas_venta_raw
), agg AS (
 SELECT master_norm(sku) sku,
 count(DISTINCT master_norm(marca)) FILTER(WHERE master_norm(marca) IS NOT NULL) marcas,
 count(DISTINCT master_norm(nombre)) FILTER(WHERE master_norm(nombre) IS NOT NULL) nombres,
 jsonb_agg(DISTINCT jsonb_build_object('marca',master_norm(marca),'nombre',master_norm(nombre))) evidence
 FROM observed WHERE master_norm(sku) IS NOT NULL GROUP BY 1
)
INSERT INTO master_conflicts(dominio,natural_key,conflict_type,evidence)
SELECT 'producto',sku,CASE WHEN marcas>1 THEN 'sku_multiple_brand' WHEN nombres>1 THEN 'sku_multiple_commercial_name' ELSE 'sku_without_commercial_name' END,evidence
FROM agg WHERE marcas>1 OR nombres<>1
ON CONFLICT(dominio,natural_key,conflict_type) DO UPDATE SET evidence=excluded.evidence,updated_at=now();

COMMIT;
