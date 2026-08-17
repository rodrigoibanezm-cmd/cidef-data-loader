# Motors

## Rol
Definir qué capacidades existen y cuáles puede invocar el agente GPT de laboratorio.

## Principio
El agente explora con pocas capacidades generales y controladas. Los motores especializados son atajos deterministas para preguntas ya formalizadas, no el lenguaje principal del análisis.

## Superficie del agente GPT: lectura solamente

### `table_schema`
Descubre columnas y tipos reales de una o más tablas permitidas.

### `profile_table`
Perfila tamaño, nulos, cardinalidad, rangos y valores frecuentes de una tabla.

### `query_table`
Motor general principal. Permite selección, filtros, distinct, orden, group-by y agregaciones controladas sin SQL libre.

### `join_tables`
Cruza dos tablas permitidas usando columnas existentes elegidas explícitamente. Puede normalizar texto con `TRIM + UPPER` cuando corresponda.

## Tablas disponibles al núcleo general
- `rvm_raw`
- `inventario_vehiculos_global_raw`
- `notas_venta_raw`
- `estadisticas_venta_raw`
- `lista_precios_raw`
- `brands_master`
- `vehicle_models_master`
- `vehicle_versions_master`
- `active_vehicle_models`
- `active_vehicle_models_history`
- `market_penetration_monthly_all`
- `market_penetration_monthly_china`
- `dealers_master`
- `dealer_sucursales`
- `supervisor_dealer_analytics`

La lista técnica canónica vive en `lib/motors/allowed-tables.js`. Si ROM y código divergen, corregir ROM/código; no asumir silenciosamente.

## Motores especializados analíticos
Usarlos solo cuando su contrato coincide exactamente con la pregunta:
- `dealer_inventory_aging`
- `market_penetration`
- `rvm_market_pareto`
- `rvm_quality_audit`
- `geographic_market_analysis`
- `monthly_seasonality_analysis`
- `intramonth_week_curve`

El agente puede ignorarlos y reconstruir evidencia con motores generales si necesita otra granularidad, filtro o comparación.

## Regla de investigación
1. entender la pregunta;
2. consultar contexto estructural solo si hace falta;
3. obtener un agregado pequeño con `query_table`;
4. cruzar con `join_tables` solo si la evidencia está en dominios distintos;
5. hacer drill-down cuando exista una hipótesis concreta;
6. responder o declarar `MISSING_CAPABILITY`.

No diseñar de antemano un motor distinto para cada pregunta posible.

## Creación de capacidades
Cuando una pregunta útil no pueda resolverse bien con los motores generales, el agente debe proponer un motor nuevo con responsabilidad única, inputs, output, evidencia y validación. No debe fingir que el motor ya existe.

Si una secuencia general se repite, cuesta muchos payloads o requiere una regla de negocio estable, es candidata a motor determinista.

## Capacidades operacionales del backend
Existen motores de importación, limpieza, refresh, enriquecimiento y migración en el backend. No forman parte de la superficie analítica read-only del GPT de laboratorio salvo habilitación explícita posterior.

Entre ellos están imports de inventario/RVM/ventas/precios, refresh de maestros/materializaciones, clasificación y upserts.

## Identidad y reglas
- Dealers: resolver contra `dealers_master`.
- Geografía dealer: resolver contra `dealer_sucursales`; un dealer puede tener múltiples regiones.
- Stock dealer: usar regla canónica de `base.md`.
- No hardcodear dealers, marcas, segmentos, regiones o modelos dentro de nuevos motores salvo que sean categorías contractuales explícitas.

## Motores retirados
Permanecen retirados como contratos legacy: `sales_consolidation`, `time_analysis`, `distribution_analysis`, `group_analysis`, `trend_analysis`, `correlation_analysis`, `outlier_analysis`, `cohort_analysis`, `margin_analysis`, `inventory_aging`, `available_inventory`, `open_sales_inventory`, `normalize_rvm`.

Si una necesidad parecida reaparece, diseñar una nueva versión desde la pregunta real y los datos actuales.