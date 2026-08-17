# Motors

## Rol
Definir la superficie analítica del agente GPT.

## Arquitectura
Una sola Action llama `/api/router`. Cada request contiene:
- `motor`
- `input`

El agente dispone únicamente de cuatro motores generales. El objetivo es explorar datos con seguridad, detectar gaps reales y diseñar nuevas capacidades desde preguntas concretas.

## Motores habilitados

### `table_schema`
Descubre columnas y tipos reales de una o varias tablas permitidas.

Usar cuando falta certeza estructural. No sirve para enumerar todo Neon.

### `profile_table`
Perfila una tabla permitida o un subconjunto de columnas: tamaño, nulos, cardinalidad, rango, valores frecuentes y muestras.

Usar para entender semántica empírica antes de consultar o cruzar.

### `query_table`
Motor principal sobre una tabla permitida.

Soporta:
- `select` o `aggregate`
- filtros `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `in`, `is_null`, `not_null`
- selección de columnas
- `distinct`
- agregaciones `count`, `sum`, `avg`, `min`, `max`
- `group_by` máximo 3 dimensiones
- `order_by`
- `offset`
- límite estándar 300
- `force_limit=true` para superar 300, máximo técnico 2000

### `join_tables`
Cruza dos tablas permitidas usando llaves explícitas existentes.

Soporta:
- `inner` y `left`
- normalización opcional de llaves con `TRIM + UPPER`
- filtros separados por lado
- `select` o `aggregate`
- group-by máximo 3 dimensiones después del join
- métricas `count`, `sum`, `avg`, `min`, `max`
- `order_by`, `offset`
- límite estándar 300; máximo forzado 2000

## Catálogo fijo
Las tablas permitidas están definidas en `catalog.md` y `lib/motors/allowed-tables.js`. El agente no debe acceder a ninguna tabla fuera del catálogo ni solicitar un motor `list_tables`.

## Estrategia
1. partir por la tabla más cercana a la pregunta;
2. filtrar el dominio por fecha, año, marca, dealer, supervisor, modelo, región, sucursal, VIN u otra columna real cuando corresponda;
3. preferir agregado a filas granulares;
4. hacer drill-down progresivo;
5. usar join solo cuando la evidencia esté repartida entre dos tablas;
6. si no puede obtener evidencia suficiente con estos motores, devolver `MISSING_CAPABILITY`.

## Regla de payload
300 filas es el estándar, no un objetivo. Pedir menos cuando baste. `force_limit=true` solo se usa cuando el análisis necesita expresamente más de 300 filas y no existe una agregación o filtro mejor.

## Nuevos motores
Un nuevo motor nace solo de un gap probado con preguntas reales. El agente puede especificarlo, pero no inventar que existe ni ejecutarlo antes de implementarlo y registrarlo.
