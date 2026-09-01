# Registro de capacidades — CIDEF Motor Lab

Una capacidad solo está `AVAILABLE` si existe en `/api/custom-gpt` y en `schema.json`.

## AVAILABLE

### `list_tables`

Devuelve la allowlist operacional vigente separada en RAW y MASTER. Usar al inicio cuando exista duda sobre qué tablas puede explorar el GPT.

### `table_schema`

Devuelve columnas y tipos físicos reales de una o varias tablas permitidas.

Usar para descubrir estructura y evitar inventar nombres de columnas.

### `profile_table`

Perfila una tabla o columnas seleccionadas y entrega:

- filas;
- nulos;
- cardinalidad;
- mínimo/máximo;
- valores frecuentes.

Usar para entender semántica empírica, calidad y distribución antes de construir una lógica.

### `query_table`

Consulta una sola tabla permitida mediante operaciones controladas:

```text
select
aggregate
```

Filtros disponibles:

```text
eq
neq
gt
gte
lt
lte
contains
in
is_null
not_null
```

Agregaciones:

```text
count
sum
avg
min
max
```

Admite hasta 4 columnas en `group_by`.

Límite máximo de respuesta: 1000 filas.

No acepta SQL libre.

## NOT AVAILABLE

No forman parte de la superficie actual del Custom GPT:

- `join_tables`
- `vin_olap`
- `contextual_slice`
- imports
- refresh
- operaciones MASTER/canónicas temporales
- DDL/DML
- SQL libre

Pueden existir internamente en el repositorio, pero el GPT no debe asumir que están disponibles.

## Cómo nace un motor nuevo

Cuando una pregunta no puede cerrarse con evidencia exploratoria simple, el objetivo no es simular el cálculo manualmente indefinidamente.

Se debe especificar un motor determinista con:

```text
name
business_question
inputs
source_tables
identity_dependencies
calculation
filters
output
coverage
warnings
validation
shared_dependencies
```

Después de implementado y validado, ese motor puede incorporarse a la superficie del Custom GPT si resulta útil para seguir diseñando o probando familias superiores.
