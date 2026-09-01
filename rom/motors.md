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

### `ventas_monthly_dedup_sensitivity_v01`

Motor determinista de diagnóstico para Familia 1.

Pregunta:

> ¿Cuánto cambia la serie mensual de ventas si cada VIN repetido se asigna al mes de su primera factura versus al mes de su última factura?

Input:

```text
start_month: YYYY-MM
end_month: YYYY-MM
```

Fuente única:

```text
ventas_raw
```

Reglas:

- VIN no nulo: una unidad por VIN;
- FIRST: mes de la primera `fecha_factura` cronológica;
- LAST: mes de la última `fecha_factura` cronológica;
- VIN nulo o vacío: una unidad por fila en ambos escenarios;
- la ventana se aplica después de calcular FIRST/LAST sobre todo el snapshot disponible;
- no usa cliente, producto, sucursal, vendedor ni MASTER.

Devuelve serie mensual FIRST/LAST, deltas, YoY, matriz agregada de redistribución, cobertura y reconciliaciones global/ventana.

Este motor mide sensibilidad. No decide si FIRST o LAST es la regla comercial correcta.

### `ventas_cross_month_first_last_audit_v01`

Motor determinista de auditoría para cerrar el grain temporal de Familia 1.

Pregunta:

> ¿Qué atributos cambian entre FIRST y LAST para los VIN cuyo mes de primera factura es distinto del mes de última factura?

Input:

```text
start_month: YYYY-MM
end_month: YYYY-MM
```

Fuente única:

```text
ventas_raw
```

Reglas:

- reutiliza exactamente el parser de `fecha_factura` del motor de sensibilidad;
- universo principal: VIN no nulo con FIRST y LAST en meses distintos;
- compara FIRST vs LAST en cliente, razón social, factura, operación, tipo de operación, propuesta, sucursal, vendedor y precio;
- calcula matrices direccionales y frecuencia de cambios;
- reporta explícitamente `FK SPA` y `CIDEF S.A.` sin atribuirles significado comercial;
- si varias filas comparten la misma fecha extrema, usa el menor `id` solo como desempate técnico estable y reporta el VIN como ambiguo por empate;
- no decide qué evento es comercialmente correcto.

Devuelve agregados exhaustivos del universo, transiciones de mes, comparación por atributo, clientes FIRST/LAST, precios, combinaciones frecuentes, ejemplos y auditoría de empates.

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
