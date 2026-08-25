# Registro de capacidades

Un motor solo puede aparecer como `AVAILABLE` si está registrado en backend/router y expuesto por `schema.json`.

## AVAILABLE

### `table_schema`

Devuelve columnas y tipos reales de una o varias tablas permitidas. Usar cuando falta certeza estructural; no enumera Neon completo.

### `profile_table`

Perfila una tabla o columnas permitidas: filas, nulos, cardinalidad, mínimos, máximos, valores frecuentes y muestras. Usar para validar la semántica empírica antes de consultar.

### `query_table`

Consulta una tabla permitida con `select` o `aggregate`. Soporta selección, `distinct`, filtros `eq|neq|gt|gte|lt|lte|contains|in|is_null|not_null`, métricas `count|sum|avg|min|max`, `group_by` de hasta tres columnas, orden y paginación. Límite estándar 300; más requiere `force_limit=true`; máximo 2000. No acepta SQL libre ni transformaciones arbitrarias.

### `join_tables`

Cruza dos tablas permitidas por llaves explícitas existentes, con join `inner|left` y normalización opcional `TRIM + UPPER`. Soporta filtros por lado, `select|aggregate`, hasta tres grupos, métricas `count|sum|avg|min|max`, orden y paginación. Límite estándar 300; máximo forzado 2000. No encadena más de dos tablas ni acepta SQL libre.

### `vin_olap`

Motor semántico determinista sobre `VIN_SEMANTIC_CUBE_V0.1`, preferido para análisis VIN internos expresables por el cubo. Soporta universos, dimensiones semánticas, time roles explícitos, filtros, `unit_count`, `aging_days`, cobertura y auditoría.

No es SQL libre y no acepta columnas físicas. No realiza forecasting, causalidad, ranking sofisticado ni análisis superiores de negocio. Ver `vin-cube.md`.

Los demás motores registrados internamente en backend no forman parte de la superficie invocable del GPT.
