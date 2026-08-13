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

## Ingesta y actualización
- `import_inventario`
- `import_notas_venta`
- `import_estadisticas_venta`
- `import_lista_precios`
- `import_rvm`

`normalize_rvm` es legacy/deprecated y no pertenece al flujo operativo.

## Materializaciones
- `refresh_market_penetration_monthly`: actualiza penetración mensual total y china.
- `refresh_active_vehicle_models`: actualiza snapshot actual e histórico de modelos activos.

## Mercado
Los contratos RVM de preparación y Pareto están en `rvm-motors.md`.
### `market_penetration`
Responsabilidad: evolución, ranking y comparación de penetración mensual.

Inputs principales:
- `universe`: `ALL` o `CHINA`
- `brands`: marcas de foco opcionales; no restringen el payload global
- `segment`: default `TOTAL`
- `months`: 1–24
- `comparison`: `none`, `rolling`, `same_period_last_year`
- `end_month`: opcional

Devuelve todas las marcas del universo consultado, ranking, penetración, comparación y serie mensual.

### `geographic_market_analysis`
Responsabilidad: participación, ranking y evolución mensual por región o comuna.

Inputs:
- Obligatorios: `level` (`REGION|COMUNA`) y `universe` (`ALL|CHINA`).
- Opcionales: `brand`, `segment`, `months`, `comparison`, `end_month`, `page`, `page_size`.

`brand` nunca modifica el denominador ni el cálculo previo del ranking. `ALL` y `CHINA`
son universos explícitos e independientes. La paginación opera sobre geografías completas;
nunca corta marcas dentro de una geografía.

Contrato detallado: `geographic-market-analysis.md`.

### Estacionalidad de ventas
- `monthly_seasonality_analysis`: estacionalidad mensual MARKET o CIDEF.
- `intramonth_week_curve`: distribución W1-W5 y últimos 7 días del mes.

Contratos: `monthly-seasonality-analysis.md` e `intramonth-week-curve.md`.

## Inventario
### `available_inventory`
Responsabilidad: determinar vehículos nuevos disponibles a nivel VIN único.

### `inventory_aging`
Responsabilidad: analizar antigüedad del inventario.

## Enriquecimiento de modelos
### `detect_pending_model_enrichment`
Responsabilidad: detectar modelos activos sin atributos estructurales completos.

### `upsert_model_enrichment`
Responsabilidad: escribir de forma controlada `largo_mm`, `cilindrada_cc` y derivar `rango_motor`.

## Analítica genérica existente
- `sales_consolidation`
- `time_analysis`
- `distribution_analysis`
- `group_analysis`
- `trend_analysis`
- `correlation_analysis`
- `outlier_analysis`
- `cohort_analysis`
- `margin_analysis`

## Regla de gap
Si la pregunta requiere una capacidad no representada por estos motores, `decide.md` debe devolver `MISSING_CAPABILITY` y describir la responsabilidad mínima del motor faltante.
