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
- FIRST/LAST se calculan globalmente sobre el snapshot RAW completo;
- para el análisis de ventana se incluye un VIN cross-month si FIRST o LAST cae dentro del rango solicitado;
- cualquier VIN no nulo con al menos una `fecha_factura` inválida o nula se excluye del universo, igual que en el motor de sensibilidad;
- compara FIRST vs LAST en cliente, razón social, factura, operación, tipo de operación, propuesta, sucursal, vendedor y precio;
- `FK SPA` y `CIDEF S.A.` se reconocen por `cliente` o `razon_social`, porque RAW puede almacenar el código en `cliente` y el nombre en `razon_social`;
- si varias filas comparten la misma fecha extrema, usa el menor `id` solo como desempate técnico estable y reporta el VIN como ambiguo por empate;
- no decide qué evento es comercialmente correcto.

Además de los agregados originales, la versión interna 0.2 devuelve:

- auditoría de los 3 clientes FIRST más frecuentes;
- cuántos pasan a un cliente LAST distinto y cuántos permanecen en el mismo cliente;
- cruce `first_customer × same/different_customer × from_month × change_combination`;
- cohortes separadas `FIRST_2025-09`, `FIRST_2025-12` y `REST`;
- conteos explícitos de extremos que quedan fuera de la ventana solicitada;
- semántica de ventana documentada en `universe_policy`.

El objetivo sigue siendo caracterizar evidencia para una regla temporal V0.1, no inferir por sí mismo el significado comercial de FIRST o LAST.

### `ventas_hybrid_unresolved_sensitivity_v01`

Motor determinista de sensibilidad residual para cerrar el remanente cross-month de Familia 1.

Pregunta:

> ¿Cambiar de FIRST a LAST únicamente los VIN cross-month no cubiertos por la regla dominante altera materialmente la serie mensual?

Inputs:

```text
start_month: YYYY-MM              default 2021-01
end_month: YYYY-MM                default 2026-07
dominant_first_customers: string[]
  default [77050575, 96800910, 96726670]
```

Fuente única:

```text
ventas_raw
```

Política:

- reutiliza exactamente el parser de `fecha_factura` ya certificado;
- FIRST/LAST se determinan globalmente sobre el snapshot RAW completo;
- VIN no cross-month: mismo mes en escenario A y B;
- VIN cross-month cuyo FIRST `cliente` pertenece a `dominant_first_customers`: LAST en A y B;
- VIN cross-month no cubierto: FIRST en A y LAST en B;
- VIN nulo: una unidad por fila parseable, idéntica en A y B;
- VIN no nulo con cualquier fecha inválida/nula se excluye completo de ambos escenarios;
- empate exacto de fecha extrema usa menor `id` únicamente como desempate técnico;
- la ventana se aplica después de construir las políticas globales A/B.

Devuelve:

- tamaño y proporción del remanente no resuelto;
- `FIRST month → LAST month` exclusivamente para ese remanente;
- series mensuales híbridas A/B;
- delta firmado, absoluto y porcentual;
- YoY A/B y cambios reales de signo;
- meses con impacto absoluto >1% y >2%;
- máximo impacto mensual absoluto y porcentual;
- reconciliación global y de ventana;
- validaciones de partición y conservación de unidades.

Los valores 1.036 / 970 / 66 son evidencia observada del snapshot actual, no constantes hardcodeadas. El motor debe seguir siendo válido si RAW cambia.

### `ventas_unresolved_recognition_evidence_v01`

Motor determinista de auditoría de evidencia para los VIN cross-month que siguen fuera de la regla dominante.

Pregunta:

> Para el remanente no resuelto, ¿alguna evidencia disponible en `notas_venta_raw` o en el snapshot actual `vehiculos_raw` discrimina FIRST versus LAST sin introducir una convención arbitraria?

Inputs:

```text
start_month: YYYY-MM              default 2021-01
end_month: YYYY-MM                default 2026-07
dominant_first_customers: string[]
  default [77050575, 96800910, 96726670]
```

Fuentes:

```text
ventas_raw
notas_venta_raw
vehiculos_raw
```

Política:

- deriva el universo objetivo desde `ventas_raw` usando exactamente FIRST/LAST global y la regla dominante ya vigente;
- no reabre los VIN cross-month ya resueltos por cliente FIRST dominante;
- en `notas_venta_raw`, identifica presencia del evento por coincidencia exacta con prioridad `nro_operacion > factura > fecha_factura`;
- `notas_venta_raw` se trata como evidencia histórica/de proceso: que FIRST o LAST aparezca allí no prueba por sí solo vigencia;
- en `vehiculos_raw`, la alineación de evento se define por coincidencia exacta de factura/numero_factura o fecha_factura;
- coincidencia de `cliente` en `vehiculos_raw` se reporta por separado y nunca decide el evento por sí sola;
- `vehiculos_raw` es un snapshot actual deduplicado por VIN, por lo que una alineación exclusiva FIRST o LAST se interpreta como evidencia de persistencia actual, no como prueba automática de reconocimiento comercial;
- ningún resultado se eleva automáticamente a regla de negocio.

Devuelve:

- reconciliación del universo cross-month/resuelto/no resuelto;
- cobertura del remanente en `notas_venta_raw` y `vehiculos_raw`;
- presencia FIRST-only / LAST-only / both / neither en notas;
- estados asociados en notas: `tiene_operacion`, `esta_autorizado`, `esta_pendiente_entrega`, `etapa`;
- alineación actual de `vehiculos_raw` por factura, fecha y cliente;
- `vigente`, `etapa` y `pendiente_entrega` agrupados por dirección de alineación;
- registro compacto de cada VIN no resuelto para auditoría;
- conteo explícito de cuántos VIN apuntan exclusivamente a FIRST o LAST en el snapshot actual.

Este motor existe para responder si las RAW ya contienen evidencia suficiente para cerrar los 66 casos. Si ninguna fuente discrimina, la conclusión correcta es que falta evidencia externa; no corresponde seguir fabricando reglas sobre `ventas_raw`.

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
