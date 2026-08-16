# Motors

## Rol
Definir el catálogo de capacidades que el agente puede invocar.

## Principio
Si un motor no aparece aquí, no existe para el agente.

Cada motor tiene una sola responsabilidad y una llamada ejecuta un solo motor.

## Descubrimiento
- `profile_table`: perfila estructura, nulos y cardinalidad.
- `table_schema`: devuelve schema de una tabla.
- `query_table`: consulta controlada.
- `join_tables`: cruce controlado entre tablas.

Estos motores son deliberadamente genéricos porque el GPT de laboratorio debe poder explorar datos y probar hipótesis.

## Ingesta y actualización
- `import_inventario`
- `clean_inventario`
- `import_notas_venta`
- `import_estadisticas_venta`
- `import_lista_precios`
- `import_rvm`

## Materializaciones y maestros
- `refresh_market_penetration_monthly`
- `refresh_active_vehicle_models`
- `refresh_vehicle_models_master`
- `refresh_vehicle_versions_master`
- `classify_electrification`
- `detect_pending_model_enrichment`
- `upsert_model_enrichment`

## Mercado
- `market_penetration`: evolución, ranking y comparación de penetración mensual.
- `rvm_market_pareto`: concentración y Pareto del mercado RVM.
- `rvm_quality_audit`: auditoría de calidad del RVM.
- `geographic_market_analysis`: participación, ranking y evolución por región/comuna.
- `monthly_seasonality_analysis`: estacionalidad mensual MARKET o CIDEF.
- `intramonth_week_curve`: distribución W1-W5 y últimos 7 días del mes.

## Inventario dealer
- `dealer_inventory_aging`: VIN dealer vigentes y aging desde `fecha_ingreso_stk`.

La identidad de dealers se resuelve contra `dealers_master`. No agregar listas hardcodeadas de dealers dentro de motores.

## Motores retirados
Se eliminaron motores genéricos/legacy cuya semántica dependía de estructuras antiguas o duplicaba capacidades de exploración:

- `normalize_rvm`
- `sales_consolidation`
- `time_analysis`
- `distribution_analysis`
- `group_analysis`
- `trend_analysis`
- `correlation_analysis`
- `outlier_analysis`
- `cohort_analysis`
- `margin_analysis`
- `inventory_aging`
- `available_inventory`
- `open_sales_inventory`

También se retiraron los endpoints temporales `api/rvm-cron.js` y `api/rvm-progress.js` usados durante la carga inicial de RVM.

## Regla de gap
Si la pregunta requiere una capacidad no representada por estos motores, el agente puede primero explorar mediante `query_table`/`join_tables`. Si la lógica se vuelve repetible o operacional, debe convertirse en un motor determinista específico.
