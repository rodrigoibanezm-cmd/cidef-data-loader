# Motors

## Rol
Definir el catálogo de capacidades que el agente puede invocar.

## Principio
Si un motor no aparece aquí, no existe para el agente.

El agente debe resolver primero mediante motores generales de exploración y análisis. Los motores especializados existen para lógica repetible, operacional o contractual; no para anticipar cada pregunta posible.

## Núcleo analítico general
Estos son los motores preferidos para investigar preguntas nuevas y construir hipótesis.

### `table_schema`
Responsabilidad: descubrir columnas y tipos reales de una o más tablas permitidas.

Usar cuando el agente no conoce con certeza la estructura necesaria para responder.

### `profile_table`
Responsabilidad: entender tamaño, nulos, cardinalidad, rangos y valores frecuentes de una tabla.

Usar para comprender semántica empírica antes de diseñar una consulta o un nuevo motor.

### `query_table`
Responsabilidad: selección, filtros y agregaciones controladas sobre tablas permitidas.

Debe ser el motor general principal para obtener evidencia sin SQL libre.

### `join_tables`
Responsabilidad: cruzar dos tablas permitidas mediante llaves explícitamente validadas.

Usar cuando la evidencia requerida está distribuida entre dominios distintos.

## Regla de investigación
Para una pregunta analítica nueva:

1. descubrir estructura solo si hace falta;
2. obtener la evidencia mínima con `query_table` y/o `join_tables`;
3. analizar el resultado;
4. pedir otra evidencia solo si cambia materialmente la respuesta;
5. si la pregunta no puede resolverse con el núcleo general, declarar `MISSING_CAPABILITY`;
6. si el patrón demuestra valor y se repite, convertirlo en un motor determinista nuevo.

El objetivo del laboratorio es usar preguntas reales para descubrir qué motores especializados merecen existir.

## Motores especializados existentes
Siguen disponibles, pero no son el punto de partida obligatorio para preguntas nuevas.

### Inventario dealer
- `dealer_inventory_aging`: VIN dealer vigentes y aging desde `fecha_ingreso_stk`.

### Mercado / RVM
- `market_penetration`
- `rvm_market_pareto`
- `rvm_quality_audit`
- `geographic_market_analysis`
- `monthly_seasonality_analysis`
- `intramonth_week_curve`

Estos motores deben usarse cuando su contrato coincide exactamente con la pregunta. No forzar una pregunta para que encaje en un motor especializado.

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

## Identidad y reglas de dominio
La identidad de dealers se resuelve contra `dealers_master`. No agregar listas hardcodeadas de dealers dentro de motores.

Las reglas de stock, aging, actividad de modelos u otras definiciones canónicas deben vivir en documentación o motores deterministas; el agente no debe reinventarlas en cada análisis.

## Regla de gap
Si los motores actuales no permiten obtener la evidencia necesaria, el agente debe decirlo explícitamente.

Formato esperado del gap:
- pregunta que no pudo resolverse;
- evidencia que falta;
- tabla/dimensión disponible o ausente;
- responsabilidad mínima del motor requerido;
- por qué los motores actuales no bastan.

No inventar una respuesta parcial como si fuera concluyente.

## Motores retirados
Se mantienen retirados los motores legacy cuya semántica dependía de estructuras antiguas o duplicaba capacidades generales:

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

El hecho de que una capacidad genérica haya sido retirada no impide volver a crear una versión mejor si una necesidad real del laboratorio lo justifica.