SELECT 'producto_versions' check_name,count(*)::text value FROM versiones_master
UNION ALL SELECT 'producto_sku_raw',count(DISTINCT sku)::text FROM (
 SELECT master_norm(modelo) sku FROM vehiculos_raw UNION SELECT master_norm(articulo) FROM ventas_raw UNION SELECT master_norm(modelo) FROM notas_venta_raw
) x WHERE sku IS NOT NULL
UNION ALL SELECT 'sucursales_master',count(*)::text FROM sucursales_master
UNION ALL SELECT 'sucursales_raw_ids',count(DISTINCT trim(id_sucursal_vta))::text FROM ventas_raw WHERE master_norm(id_sucursal_vta) IS NOT NULL
UNION ALL SELECT 'personas_master',count(*)::text FROM personas_master
UNION ALL SELECT 'personas_mapped',count(*) FILTER(WHERE nombre_canonico IS NOT NULL)::text FROM personas_master
UNION ALL SELECT 'personas_pending',count(*) FILTER(WHERE nombre_canonico IS NULL)::text FROM personas_master
UNION ALL SELECT 'dealers_master',count(*)::text FROM dealers_master
UNION ALL SELECT 'dealer_validated_rut',count(*) FILTER(WHERE identity_status='rut_validated')::text FROM dealers_master
UNION ALL SELECT 'conflicts_pending',count(*) FILTER(WHERE status='pending')::text FROM master_conflicts;

SELECT 'duplicate_product_sku' check_name,count(*) n FROM (SELECT codigo_normalizado FROM versiones_master GROUP BY 1 HAVING count(*)>1) x
UNION ALL SELECT 'duplicate_branch_source_id',count(*) FROM (SELECT id_sucursal_vta FROM sucursales_master GROUP BY 1 HAVING count(*)>1) x
UNION ALL SELECT 'duplicate_person_login',count(*) FROM (SELECT usuario_canonico FROM personas_master GROUP BY 1 HAVING count(*)>1) x
UNION ALL SELECT 'duplicate_dealer_rut',count(*) FROM (SELECT rut_normalizado FROM dealers_master GROUP BY 1 HAVING count(*)>1) x;

SELECT dominio,conflict_type,count(*) n FROM master_conflicts WHERE status='pending' GROUP BY 1,2 ORDER BY 1,2;
