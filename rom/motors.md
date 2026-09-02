# Registro de capacidades — CIDEF Agent Motor Lab

Una capacidad solo está `AVAILABLE` si existe en el router dedicado del agente `lib/custom-gpt-router.js`, es invocable por `/api/custom-gpt` y está declarada en `rom/schema.json`.

El router multi-tenant `/api/router` NO es la superficie del agente y no debe usarse para estas capacidades.

## AVAILABLE

### `list_tables`

Devuelve la allowlist operacional vigente separada en RAW y MASTER. Usar al inicio cuando exista duda sobre qué tablas puede explorar el agente.

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

### `ventas_identity_coverage_v01`

Motor determinista transversal de **cobertura de identidad comercial**. Es una pieza habilitante para Familia 4 — DESEMPEÑO RELATIVO y para cualquier motor que necesite atribuir ventas históricas a tienda y vendedor canónicos.

Pregunta:

> ¿Qué proporción de las filas históricas de `ventas_raw` puede atribuirse determinísticamente a sucursal y persona canónicas?

Input:

```json
{}
```

Fuentes:

```text
ventas_raw
sucursales_master
personas_master
```

Dependencias de identidad:

```text
ventas_raw.id_sucursal_vta
  -> sucursales_master.id_sucursal_vta
  -> sucursal_id

ventas_raw.nombre_usuario
  -> personas_master.usuario_canonico
  -> persona_id
```

Política:

- grain = una fila fuente de `ventas_raw`; este motor audita llaves RAW→MASTER y no deduplica ventas por VIN;
- matching exclusivamente por igualdad exacta de las llaves declaradas;
- no usa `desc_sucursal_vta`, nombre completo, similitud textual ni heurísticas;
- cada dimensión se clasifica como `RESUELTA`, `NO_RESUELTA` o `AMBIGUA`;
- una llave MASTER que aparezca más de una vez se considera ambigua y no se eleva a identidad resuelta;
- `personas_master.validated=false` se reporta como warning separado, sin convertir por sí solo un login exacto en otra identidad;
- identidad canónica de persona no prueba por sí sola rol vendedor histórico;
- persistencia exclusivamente runtime; no crea tabla ni mapping materializado.

Devuelve:

```text
engine
version
status
policy
rows_total
coverage:
  store
  seller
  both
distinct_keys
unresolved
ambiguous
resolved_to_unvalidated_person_rows
validation
warnings
```

Validaciones principales:

```text
store_reconciles
seller_reconciles
joint_not_above_store
joint_not_above_seller
store_master_key_unique
seller_master_key_unique
```

`status=warning` si existe cualquier gap de cobertura, ambigüedad o falla de reconciliación. El motor no define un umbral de materialidad: devuelve la cobertura exacta observada para que el consumidor decida si es suficiente para su uso.

### `ventas_organizational_context_v01`

Contexto runtime determinista común para **Familia 4 — DESEMPEÑO RELATIVO** y otros consumidores organizacionales.

Pregunta base:

> ¿Cuál es la serie histórica mensual canónica de ventas reconocidas de CIDEF por sucursal y, dentro de cada sucursal, por persona, preservando la sucursal observada en el evento histórico?

Inputs:

```text
start_month: YYYY-MM
end_month: YYYY-MM
```

Fuentes:

```text
ventas_raw
sucursales_master
personas_master
```

Dependencias compartidas:

```text
ventas_context_v01
recognizedSales[]
parser temporal vigente
reglas exactas de identidad certificadas por ventas_identity_coverage_v01
```

Política:

- no cuenta filas RAW como ventas: reutiliza exactamente las ventas reconocidas por `ventas_context_v01`;
- el contexto base se construye sobre toda la evidencia disponible;
- `start_month` y `end_month` filtran la salida **después** del reconocimiento; `end_month` no es un cutoff temporal;
- cada evento reconocido conserva las llaves fuente exactas `id_sucursal_vta` y `nombre_usuario` antes de cualquier `trim` usado para campos descriptivos;
- identidad tienda = igualdad exacta de la llave fuente del evento contra `sucursales_master.id_sucursal_vta`;
- identidad vendedor = igualdad exacta de la llave fuente del evento contra `personas_master.usuario_canonico`;
- la sucursal histórica sale del mismo evento reconocido y nunca se reasigna mediante `persona_sucursal` vigente;
- una persona puede aparecer en sucursales distintas a través del tiempo o dentro del mismo mes si así lo observa la venta reconocida;
- persistencia exclusivamente runtime; no crea tabla, fact, mart ni cubo.

Grains:

```text
base runtime:
  recognized sale

CIDEF:
  month

CIDEF -> TIENDA:
  month + sucursal_id

TIENDA -> VENDEDOR:
  month + sucursal_id + persona_id
```

Devuelve:

```text
engine
version
status
policy
context
scope
cidef_monthly[]:
  month
  sales
store_monthly[]:
  month
  sucursal_id
  sales
  cidef_sales
  share_of_cidef
seller_monthly[]:
  month
  sucursal_id
  persona_id
  sales
  store_sales
  share_of_store
identity_metadata
coverage
validation
warnings
```

Cobertura principal:

```text
recognized_sales_total
recognized_sales_available_total
recognized_sales_with_store_identity
recognized_sales_with_seller_identity
recognized_sales_with_both_identities
unresolved_store
unresolved_seller
ambiguous_store
ambiguous_seller
resolved_to_unvalidated_person
```

Validaciones principales:

```text
ventas_context_reconciles
monthly_cidef_reconciles_with_ventas_context
sum(store_sales) por mes = cidef_sales
sum(seller_sales) por tienda/mes = store_sales
no_seller_without_store
uses_observed_store_only
store_identity_keys_unique
seller_identity_keys_unique
shares_in_bounds
has_scoped_sales
```

Los gaps futuros de identidad no se ocultan: permanecen en el denominador CIDEF o tienda correspondiente y rompen explícitamente la reconciliación del nivel inferior. `personas_master.validated=false` se reporta como warning sin cambiar una identidad exacta resuelta.

Este contexto **no define** todavía benchmark, peer group, expectativa por unidad, score, ranking, deterioro ni umbral de desempeño. Su única responsabilidad es producir una base organizacional mensual reconciliada y reusable.

### `organizational_share_expectation_backtest_v01`

Motor determinista de laboratorio para **Familia 4 — DESEMPEÑO RELATIVO**. Versión interna actual: `0.3`.

Pregunta:

> ¿Qué baseline histórica simple estima mejor la participación mensual esperable de una tienda dentro de CIDEF o de un vendedor dentro de su tienda, usando sólo observaciones calendario previas?

Inputs:

```text
grain: tienda | vendedor
start_month: YYYY-MM
end_month: YYYY-MM
candidate_baselines:
  - last_year
  - moving_average_N
  - median_N
output_mode?: summary | monthly | units | stability
detail_limit?: 1..200
detail_candidate?: uno de candidate_baselines
```

Dependencia compartida:

```text
ventas_organizational_context_v01
```

El motor no reconstruye ventas ni identidad. Solicita al contexto organizacional el warm-up requerido por el candidato con mayor lag y evalúa targets sólo dentro de `start_month/end_month`.

Grain y variable:

```text
TIENDA:
  unit = sucursal_id
  actual_share = share_of_cidef
  sales = store sales
  parent_sales = cidef_sales

VENDEDOR:
  unit = sucursal_id + persona_id
  actual_share = share_of_store
  sales = seller sales
  parent_sales = store_sales
```

Política walk-forward:

```text
last_year(M)
  requiere M-12

moving_average_N(M)
  requiere M-1 ... M-N

median_N(M)
  requiere M-1 ... M-N
```

- cada lag es calendario exacto;
- si falta cualquier mes requerido, ese candidato no es evaluable para ese `unit-month`;
- missing nunca se convierte en 0, nunca se rellena y nunca se salta usando la última observación disponible;
- `actual_share(M)` y meses futuros nunca participan en `expected_share(M)`;
- un mismo `persona_id` en sucursales distintas representa unidades diferentes;
- `adjusted_last_year` queda fuera de este laboratorio inicial.

Comparación y selección:

- la selección candidata es global por `grain`, no por unidad;
- resultados por unidad son diagnósticos y no eligen automáticamente una regla individual;
- el ranking se calcula sobre el mismo `common_evaluable_set` de `unit-month` evaluable por todos los candidatos solicitados;
- la cobertura específica de cada candidato se conserva por separado;
- ranking determinista: `MAE_pp` ascendente, luego `|bias_pp|`, luego `median_absolute_error_pp`, luego nombre de candidato como desempate estable.

Métricas:

```text
relative_gap_pp = 100 * (actual_share - expected_share)

if expected_share is unavailable/non-evaluable:
  relative_gap_pp = null

MAE_pp
bias_pp
median_absolute_error_pp
candidate_specific_coverage
common_evaluable_coverage
```

`candidate_results[]` agrega sobre todas las filas evaluables, sin depender del límite de detalle:

```text
relative_gap_distribution:
  rows
  min_pp
  p10_pp
  p25_pp
  median_pp
  mean_pp
  p75_pp
  p90_pp
  max_pp

common_relative_gap_distribution:
  mismos campos sobre common_evaluable_set
```

Los percentiles usan interpolación lineal determinística sobre la serie ordenada. `relative_gap_distribution.mean_pp` debe reconciliar con `candidate_specific_metrics.bias_pp`.

No usa WAPE ni error relativo como métricas primarias de share.

Estabilidad:

- recalcula las mismas métricas sobre años calendario;
- recalcula sobre ventanas móviles de 12 meses calendario;
- las predicciones walk-forward originales no se modifican para estas vistas.

Output `summary` por defecto:

```text
engine
version
status
inputs
policy
ranking[]
candidate_results[]
coverage
temporal_stability summary
validation
warnings
detail_available
```

Modos de detalle acotados:

```text
monthly
units
stability
```

`detail_limit` impide respuestas Action sobredimensionadas. `detail_candidate` permite acotar el detalle a un candidato solicitado sin alterar el cálculo global.

Para `output_mode=monthly`, cuando se solicita un único candidato o `detail_candidate`, cada fila devuelve:

```text
unit_key
sucursal_id
persona_id
month
sales
parent_sales
actual_share
candidate
expected_share
relative_gap_pp
source_months[]
evaluable
```

Invariante semántica del detalle:

```text
evaluable = true
→ expected_share != null
→ relative_gap_pp != null

evaluable = false
→ expected_share = null
→ relative_gap_pp = null
```

El backend calcula `relative_gap_pp`; el LLM no debe recalcularlo. El detalle puede truncarse, pero las distribuciones del `summary` se calculan siempre sobre el universo evaluable completo.

Validaciones principales:

```text
organizational_context_ok
shares_in_bounds
sales_parent_evidence_present
share_reconciles_with_sales
expectations_in_bounds
relative_gap_mean_reconciles_with_bias
no_target_month_used
no_future_month_used
exact_calendar_lags_only
no_missing_month_imputation
seller_grain_includes_store
common_comparison_window_equal
has_common_evaluable_rows
```

La versión `0.3` es un bugfix semántico de detalle: evita que `expected_share=null` sea tratado como cero al serializar `relative_gap_pp`. No cambia reconocimiento, series, cobertura evaluable, distribuciones, métricas, ranking ni selección de baseline.

El motor **no define** todavía threshold de bajo desempeño, score, ranking de unidades, alertas, persistencia, deterioro, peer groups ni regla productiva final. Su responsabilidad es producir evidencia de backtest para seleccionar `expected_share` por grain y validar la señal relativa resultante.

### `organizational_relative_performance_v01`

Motor determinista **productivo** para **Familia 4 — DESEMPEÑO RELATIVO**. Versión interna actual: `0.1`.

Pregunta:

> ¿Cuál fue el desempeño relativo observado de cada tienda o vendedor respecto de su participación histórica esperable según la regla certificada de su grain?

Inputs:

```text
grain: tienda | vendedor
start_month: YYYY-MM
end_month: YYYY-MM
```

V0.1 acepta exclusivamente esos tres inputs. No acepta `candidate_baselines`, `cutoff_date`, `cutoff_month`, `target_month`, `output_mode` ni otros knobs del laboratorio.

Dependencias compartidas:

```text
ventas_organizational_context_v01
buildShareSeries
calculateShareExpectation
relativeGapPp
```

No duplica fórmulas del backtest. Reutiliza las mismas series, lags calendario, expectativa y cálculo de gap ya certificados.

Reglas productivas fijas:

```text
TIENDA
unit = sucursal_id
actual_share = share_of_cidef
baseline = median_3
expected_share(M) = median(share(M-1), share(M-2), share(M-3))
required_history_months = 3
```

```text
VENDEDOR
unit = sucursal_id + persona_id
actual_share = share_of_store
baseline = moving_average_5
expected_share(M) = average(share(M-1), ..., share(M-5))
required_history_months = 5
```

El caller no selecciona baseline. La regla queda versionada dentro del motor.

Semántica temporal V0.1:

```text
mode = CURRENT_SNAPSHOT
```

- `start_month/end_month` definen sólo el rango de output;
- el motor carga internamente el warm-up exacto de 3 o 5 meses previo a `start_month`;
- sólo acepta meses calendario cerrados según `America/Santiago`;
- el mes calendario en curso se rechaza; no existe semántica MTD en V0.1;
- `CURRENT_SNAPSHOT` significa que la historia refleja la evidencia reconocida disponible actualmente;
- no representa cómo habría aparecido un mes histórico al cierre de ese mismo mes;
- point-in-time/cutoff-safe queda explícitamente fuera de V0.1.

Grain de salida:

```text
TIENDA
month + sucursal_id

VENDEDOR
month + sucursal_id + persona_id
```

Universo de output:

```text
units observed in target month only
```

Una unidad ausente en el mes objetivo no genera fila y nunca se fabrica como `sales=0`.

Missing history:

```text
si la unidad está observada en el mes objetivo
pero falta cualquier lag calendario requerido:

  conservar sales / parent_sales / actual_share
  evaluable = false
  expected_share = null
  relative_gap_pp = null
```

No imputa, no usa menos meses, no salta huecos y no convierte missing en cero.

Cada fila `rows[]` devuelve:

```text
month
sucursal_id
persona_id          # sólo grain=vendedor
sales
parent_sales
actual_share
expected_share
relative_gap_pp
evaluable
source_months[]
```

`source_months[]` contiene todos los meses calendario requeridos por la regla, incluso cuando falta alguno y la fila queda no evaluable.

Metadata:

```text
certified_rule:
  baseline
  required_history_months
  actual_share

coverage:
  rows_total
  evaluable_rows
  non_evaluable_rows
```

Validaciones principales:

```text
source_context_ok
output_grain_unique
shares_in_bounds
sales_parent_evidence_present
share_reconciles_with_sales
certified_baseline_used
exact_calendar_lags_only
no_missing_month_imputation
no_target_or_future_month_used
expectations_in_bounds
relative_gap_reconciles
evaluable_semantics_ok
seller_grain_includes_store
target_months_closed
```

`evaluable_semantics_ok` exige:

```text
evaluable=true
→ expected_share != null
→ relative_gap_pp != null

evaluable=false
→ expected_share = null
→ relative_gap_pp = null
```

Warnings propagan warnings del contexto organizacional, reportan filas no evaluables por historia incompleta y recuerdan que `CURRENT_SNAPSHOT` no equivale a un snapshot histórico point-in-time.

El motor **no** selecciona candidatos, no hace backtesting, no define materialidad, threshold, score, ranking, alerta, deterioro, persistencia, forecast, MTD ni reconstrucción de roster. Su responsabilidad termina en `actual_share`, `expected_share`, `relative_gap_pp` y su trazabilidad determinística.

### `expected_monthly_backtest_v01`

Motor determinista de selección de regla de **EXPECTATIVA mensual** para Familia 1.

Pregunta:

> ¿Qué regla habría estimado mejor cuántos vehículos debía vender CIDEF en cada mes histórico sin mirar el resultado del propio mes ni información futura?

Input:

```json
{}
```

No requiere parámetros externos. Construye o reutiliza el contexto runtime común de ventas:

```text
buildVentasContext()
  -> monthlySales[]
```

Dependencia compartida:

```text
ventas_context_v01
```

Si un motor superior ya construyó el contexto, debe reutilizarlo mediante `sharedContext`; de lo contrario el motor llama `buildVentasContext()` una sola vez.

Candidatos V0.1:

```text
last_year
moving_average_3
moving_average_6
adjusted_last_year
```

Definiciones:

```text
last_year(M)
  = ventas(M - 12)

moving_average_3(M)
  = promedio ventas(M-1, M-2, M-3)

moving_average_6(M)
  = promedio ventas(M-1 ... M-6)

adjusted_last_year(M)
  = ventas(M-12)
    × [promedio(M-1,M-2,M-3)
       / promedio(M-13,M-14,M-15)]
```

Política walk-forward:

- para cada mes objetivo `M`, sólo puede usar meses anteriores a `M`;
- nunca usa ventas del propio mes objetivo para producir su expectativa;
- nunca usa meses posteriores;
- los cuatro candidatos se comparan sobre la **misma ventana común**, formada únicamente por meses donde todos son evaluables;
- no elige un modelo por intuición ni por el desempeño del mes actual.

Ranking determinista:

```text
1. WAPE ascendente
2. |bias| ascendente
3. MAE ascendente
4. candidate name ascendente como desempate estable
```

Devuelve:

```text
engine
version
status
policy
winner
ranking[]
monthly_backtest[]
coverage
validation
```

`ranking[]` contiene las métricas históricas comparables de cada candidato. `monthly_backtest[]` preserva el detalle mes a mes para auditar expectativa versus venta real.

Validaciones principales:

```text
ventas_context_ok
common_window_ok
candidates_evaluated
has_evaluable_months
```

Este motor **no** calcula todavía la proyección del mes en curso ni la brecha real versus expectativa. Su responsabilidad única es seleccionar y demostrar históricamente la regla base de EXPECTATIVA mensual.

### `expected_monthly_stability_v01`

Motor determinista de **estabilidad temporal del ranking** para Familia 1.

Pregunta:

> ¿La superioridad reciente de un candidato de EXPECTATIVA persiste al ampliar gradualmente la ventana histórica, o aparece sólo en una cohorte reciente demasiado corta?

Input:

```json
{}
```

No define candidatos nuevos ni modifica ninguna fórmula. Reutiliza exactamente `expected_monthly_backtest_v01` y sus mismos cuatro candidatos:

```text
last_year
moving_average_3
moving_average_6
adjusted_last_year
```

Dependencia compartida:

```text
ventas_context_v01
expected_monthly_backtest_v01
```

Ventanas de estabilidad predefinidas:

```text
2023 -> último mes evaluable
2024 -> último mes evaluable
2025 -> último mes evaluable
```

Además devuelve ranking separado por cada año calendario evaluable.

Para cada ventana aplica sin cambios:

```text
WAPE
bias_pct
MAE
worst_month
```

Y rankea con la misma regla certificada:

```text
1. WAPE ascendente
2. |bias| ascendente
3. MAE ascendente
4. candidate name ascendente
```

Devuelve:

```text
engine
version
status
policy
global_winner
rolling_windows[]
calendar_years[]
validation
```

Cada elemento de `rolling_windows[]` y `calendar_years[]` incluye:

```text
label
months_evaluated
first_month
last_month
winner
ranking[]
```

Este motor responde sólo la prueba acotada de régimen. **No selecciona automáticamente EXPECTED V0.1** y no introduce ponderaciones, ventanas móviles nuevas ni modelos adicionales. La decisión posterior debe comparar persistencia temporal versus desempeño global.

### `expected_monthly_candidates_v01`

Motor determinista **forward y ciego** para Familia 1.

Pregunta:

> Dado un último mes de información permitido, ¿qué EXPECTATIVA produce cada candidato para el mes inmediatamente siguiente sin usar ninguna evidencia del mes objetivo ni del futuro?

Inputs:

```text
cutoff_month: YYYY-MM
target_month: YYYY-MM
```

`target_month` debe ser exactamente el mes siguiente a `cutoff_month`.

Candidatos: reutiliza sin cambios los cuatro candidatos certificados del backtest:

```text
last_year
moving_average_3
moving_average_6
adjusted_last_year
```

Política de ceguera:

- el corte temporal se aplica **antes** de resolver LAST por VIN;
- una fila de `ventas_raw` posterior a `cutoff_month` no puede cambiar qué fila representa al VIN dentro del corte;
- después del corte se construye `ventas_context_v01` y su `monthlySales[]`;
- las fórmulas sólo reciben meses `<= cutoff_month`;
- el payload no incluye venta real del `target_month`, error observado ni ranking ganador;
- el motor no elige todavía cuál candidato usar en producción.

Dependencias reutilizables:

```text
filterVentasRowsThroughMonth()
buildVentasContext({ cutoffMonth })
buildExpectationInput()
calculateExpectations()
expectedCandidates.js
```

Devuelve:

```text
engine
version
status
cutoff_month
target_month
expectations:
  last_year
  moving_average_3
  moving_average_6
  adjusted_last_year
coverage
validation
```

Validaciones principales:

```text
context_cutoff_ok
no_target_month_used
no_future_month_used
all_candidates_available
```

Este motor queda como pieza persistente del runtime de EXPECTATIVA. Su primer uso es la prueba ciega histórica, pero los mismos helpers deben ser reutilizados por el motor productivo una vez certificada la regla final.

### `ventas_monthly_actual_v01`

Motor determinista de **venta real mensual con corte temporal** para Familia 1.

Pregunta:

> ¿Cuántas ventas reconocidas tenía un mes objetivo usando únicamente evidencia disponible hasta un cutoff dado?

Inputs:

```text
cutoff_month: YYYY-MM
target_month: YYYY-MM
```

`target_month` debe ser menor o igual que `cutoff_month`.

Política:

- reutiliza `buildVentasContext({ cutoffMonth })`;
- el cutoff se aplica **antes** de resolver LAST por VIN;
- ninguna fila posterior a `cutoff_month` puede alterar la venta reconocida de un VIN dentro del corte;
- la regla de reconocimiento es la misma de `ventas_context_v01`: VIN no nulo usa LAST `fecha_factura` dentro de la evidencia disponible; VIN nulo cuenta por fila parseable;
- devuelve sólo el real reconocido del `target_month`, no reestima candidatos ni modifica pronósticos congelados;
- para una evaluación limpia al cierre del mes objetivo, usar `cutoff_month = target_month`.

Devuelve:

```text
engine
version
status
inputs
policy
actual:
  month
  sales
coverage
validation
warnings
```

Validaciones principales:

```text
ventas_context_ok
target_within_cutoff
cutoff_context_match
target_month_present
no_post_cutoff_evidence_used
```

Este motor permite evaluar pronósticos históricos congelados contra el resultado que habría sido observable al cierre de cada mes, sin leakage de meses posteriores.

### `ventas_daily_context_v01`

Motor determinista de **snapshot diario cutoff-safe de ventas reconocidas** para Familia 1. Es la pieza habilitante para futuros backtests intra-mes como `PREDICTABILITY_DAY`; todavía no calcula forecast ni día de predictibilidad.

Pregunta:

> ¿Qué ventas reconocidas eran observables al cierre de una fecha calendario, usando exactamente la misma semántica LAST-by-VIN del contexto mensual?

Input:

```text
cutoff_date: YYYY-MM-DD
```

Dependencia compartida:

```text
buildVentasContext({ cutoffDate })
ventas_context_v01
```

Política:

- `fecha_factura <= cutoff_date` se aplica de forma inclusiva **antes** de resolver reconocimiento;
- VIN no nulo conserva la regla vigente: una venta reconocida por VIN usando LAST `fecha_factura` dentro de la evidencia observable;
- VIN nulo conserva la regla vigente: una venta por fila con `fecha_factura` parseable dentro del cutoff;
- empate exacto de LAST conserva el desempate técnico vigente por menor `id` estable;
- `cutoff_month` y `cutoff_date` son mutuamente excluyentes dentro del helper común;
- `cutoff_date = último día del mes` debe ser equivalente a `cutoff_month` para el mismo snapshot;
- no aplica clasificación organizacional: CIDEF/DEALER se resuelve después del reconocimiento;
- no calcula forecast, expectativa, concentración de cierre ni `PREDICTABILITY_DAY`.

Devuelve:

```text
engine
version
status
inputs:
  cutoff_date
policy
as_of:
  cutoff_date
  month
  day_of_month
  recognized_sales_total
  month_sales_to_date
monthly_sales[]
coverage
validation
warnings
```

Validaciones principales:

```text
ventas_context_ok
cutoff_context_match
no_post_cutoff_evidence_used
```

Invariantes de implementación cubiertas por tests:

```text
cutoff_date = month_end
→ mismo set reconocido que cutoff_month

cutoff_date antes de evidencia futura
→ la evidencia futura no participa en LAST-by-VIN
```

El contexto común `ventas_context_v01` sube a versión interna `0.3` para aceptar `cutoffDate` sin cambiar el shape de `recognizedSale` ni la semántica existente de `cutoffMonth`.

Para el futuro indicador de control de cierre, el universo organizacional deberá aplicarse después del reconocimiento usando MASTER y limitarse a `sucursales_master.tipo_canal = 'CIDEF'`; dealers quedan fuera de esa señal V0.1.

### `ventas_daily_organizational_context_v01`

Version motor: `0.2`

Contexto runtime determinista de **ventas reconocidas por sucursal histórica a un cutoff diario**, habilitante de Familia 1 para futuros backtests intra-mes de tiendas propias.

Pregunta:

> ¿Qué ventas reconocidas del mes objetivo eran observables hasta una fecha, atribuidas a la sucursal histórica exacta y clasificadas por `sucursales_master.tipo_canal`?

Input:

```text
cutoff_date: YYYY-MM-DD
```

Fuentes:

```text
ventas_raw
sucursales_master
```

Dependencias compartidas:

```text
buildVentasContext({ cutoffDate })
recognizedSales[]
loadOrganizationalIdentityMaps()
enrichRecognizedSales()
```

Pipeline:

```text
cutoff_date
→ ventas_context_v01 / LAST-by-VIN
→ recognizedSales[]
→ exact historical store identity
→ sucursales_master.tipo_canal
→ aggregation by resolved store
```

Política:

- nunca reconstruye LAST-by-VIN: reutiliza `ventas_context_v01`;
- `fecha_factura <= cutoff_date` se aplica antes del reconocimiento;
- identidad de sucursal se resuelve después del reconocimiento mediante la llave fuente histórica exacta; no usa fuzzy ni reasigna historia;
- `tipo_canal` proviene exclusivamente de `sucursales_master` después de resolver la sucursal;
- el contexto base conserva todos los canales resueltos (`CIDEF`, `DEALER`, `DEALER_AGREGADO`, `NO_COMERCIAL`);
- `cidef_owned_sales_to_date` es un agregado derivado como suma de filas con `tipo_canal='CIDEF'`; no se filtra RAW por canal antes de reconocer;
- `store_sales_to_date[]` es sparse positive only: ausencia de fila significa sólo `NO OBSERVED POSITIVE ROW`, nunca cero certificado, `ACTIVE_ZERO` ni `UNKNOWN`;
- no calcula forecast, completion ratio, expectativa ni `PREDICTABILITY_DAY`;
- persistencia exclusivamente runtime.

Devuelve:

```text
engine
version
status
inputs:
  cutoff_date
policy
as_of:
  cutoff_date
  month
  day_of_month
store_sales_to_date[]:
  sucursal_id
  sucursal
  tipo_canal
  month_sales_to_date
cidef_owned_sales_to_date
coverage:
  recognized_sales_in_target_month_to_date
  resolved_store
  unresolved_store
  ambiguous_store
  resolved_sales_by_channel
validation
warnings
```

Validaciones principales:

```text
ventas_context_ok
cutoff_context_match
no_post_cutoff_evidence_used
store_identity_keys_unique
store_reconciles_with_recognized_target_month
resolved_channels_reconcile
cidef_owned_reconciles
```

Semántica de `store_identity_keys_unique` V0.2:

```text
OBSERVED_EVENT_STORE_KEY_UNIQUENESS
= cada source key no nula usada por recognizedSales[] del target month
  resuelve exactamente a una identidad MASTER
```

Las keys `NULL` o no utilizadas por los eventos reconocidos del mes no participan en esta validation. `unresolved_store` y `ambiguous_store` siguen reportándose por separado y nunca se infieren.

Reconciliaciones:

```text
resolved_store + unresolved_store + ambiguous_store
= recognized_sales_in_target_month_to_date

sum(store_sales_to_date.month_sales_to_date)
= resolved_store

cidef_owned_sales_to_date
= sum(store_sales_to_date.month_sales_to_date where tipo_canal='CIDEF')
```

Los warnings del contexto de ventas, incluido el desempate técnico de LAST cuando corresponda, se propagan. Una sucursal resuelta sin `tipo_canal` se conserva como `UNKNOWN` y genera warning en lugar de inferirse.

Esta capacidad no densifica el roster de tiendas y no decide todavía `STORE_ACTIVE_ZERO` versus `STORE_UNKNOWN`. Para el futuro indicador de control de cierre V0.1, un consumidor posterior deberá seleccionar exclusivamente `tipo_canal='CIDEF'`; dealers quedan fuera de `PREDICTABILITY_DAY`.


### `daily_close_backtest_context_v01`

Motor runtime determinista de **contexto observacional diario** para Familia 1 — EXPECTATIVA Y CIERRE. Versión interna: `0.1`.

Inputs obligatorios:

```text
start_month: YYYY-MM
end_month: YYYY-MM
```

`end_month` debe ser cerrado; rango máximo 84 meses. Fuentes: `ventas_raw` y `sucursales_master`.

Pipeline:

```text
carga ventas_raw una vez
→ parseFechaFactura certificado
→ timeline incremental cutoff-safe
→ VIN no nulo: LAST observable al final de cada día
→ empate exacto: menor stable id
→ VIN nulo: una unidad por fila parseable
→ identidad histórica exacta
→ tipo_canal
→ snapshots diarios
```

No invoca el motor público una vez por día. Reutiliza `ventasContextUtils`, `loadOrganizationalIdentityMaps` y `enrichRecognizedSale` para evitar miles de ejecuciones redundantes.

Grains:

```text
CIDEF_PROPIO  = target_month + cutoff_date
TIENDA_PROPIA = target_month + cutoff_date + sucursal_id
```

Universo tienda V0.1:

```text
month-end tipo_canal='CIDEF' AND actual_close > 0
```

Semántica:

```text
fila positiva al cutoff → POSITIVE_OBSERVED
sin fila al cutoff + actual_close > 0 → CERTIFIED_ZERO
sin label positivo al cierre → store-month no emitido / UNKNOWN
actual_close → LABEL_ONLY
```

Devuelve `company_observations[]` y `store_observations[]` con `target_month`, `cutoff_date`, `day_of_month`, `observed_to_date` y `actual_close`; tienda agrega `sucursal_id`, `sucursal` y `observation_semantics`.

Validaciones: grains únicos, cutoff dentro del mes, no negativos, `observed_to_date <= actual_close`, igualdad al cierre, identidad/canal completos al month-end, ausencia de estado negativo y reconciliación CIDEF propio contra tiendas elegibles.

Si `observed_to_date > actual_close`, no clampa ni corrige: falla la validation y devuelve `status=warning`.

No calcula `completion_ratio`, forecast, forecast error, thresholds ni `PREDICTABILITY_DAY`.


### `ventas_product_sales_v01`

Motor determinista transversal de **ventas CIDEF reconocidas por producto canónico y período**. Es una pieza de mise en place reusable para Familia 1, Familia 2 y cualquier análisis posterior que necesite comparar crecimiento interno contra mercado/share sin reconstruir identidad manualmente.

Pregunta:

> ¿Cuántas ventas CIDEF reconocidas corresponden a un `modelo_id` canónico dentro de un período, usando la misma política temporal certificada de ventas?

Inputs:

```text
modelo_id: integer
start_month: YYYY-MM
end_month: YYYY-MM
cutoff_month: YYYY-MM
```

Contrato temporal:

```text
cutoff_month = end_month
```

Fuentes:

```text
ventas_raw
producto_aliases_v01
```

Dependencias compartidas:

```text
buildVentasContext({ cutoffMonth })
ventas_context_v01
recognizedSales[]
producto_aliases_v01 RESUELTO para ventas_raw
```

Política:

- primero aplica el cutoff temporal y después resuelve la venta reconocida exactamente con `ventas_context_v01`;
- VIN no nulo conserva la regla LAST `fecha_factura` dentro de la evidencia disponible al cutoff; VIN nulo cuenta por fila parseable;
- la identidad de producto se aplica **después** del reconocimiento de la venta, nunca antes;
- sólo consume aliases `estado=RESUELTO`, con `modelo_id` no nulo, `fuente` asociada a `ventas_raw` y nivel `MODELO` o `VERSION`;
- compara la evidencia de la venta contra `valor_raw` y `valor_normalizado` de MASTER mediante normalización exacta determinista;
- no usa fuzzy, substring, majority ni similitud textual;
- si múltiples aliases compatibles apuntan a más de un `modelo_id`, la venta queda `AMBIGUOUS` y no se asigna;
- si no existe identidad resuelta, la venta queda `UNRESOLVED` y permanece explícita en cobertura;
- `UNRESOLVED` no se reasigna por inferencia y genera warning, pero no invalida automáticamente las unidades ya resueltas del target;
- persistencia exclusivamente runtime; no crea tabla, fact, mart ni cubo.

Grain de salida:

```text
modelo_id + período solicitado
```

Devuelve:

```text
engine
version
status
inputs
policy
target:
  modelo_id
  units
  monthly_sales[]
coverage:
  period_recognized_sales
  product_resolved
  product_unresolved
  product_ambiguous
  aliases_loaded
  target_aliases
validation
warnings
```

Validaciones principales:

```text
ventas_context_ok
cutoff_context_match
cutoff_equals_end_month
target_model_aliases_present
no_ambiguous_product_identity
product_identity_complete_in_period
no_post_cutoff_evidence_used
```

`status=warning` si el modelo solicitado no tiene aliases resueltos, existe identidad ambigua en el período o falla el contexto temporal. La cobertura no resuelta se reporta explícitamente para que el consumidor evalúe materialidad sin fabricar equivalencias.

Este motor **no** calcula crecimiento, mercado, share ni efecto competitivo. Su responsabilidad única es entregar el ingrediente interno canónico `modelo_id × tiempo` para que motores superiores puedan combinarlo con `competitive_context_v01` y otros contextos del mise en place.

### `ventas_product_detail_v01`

Motor determinista transversal de **detalle auditable de ventas CIDEF reconocidas por producto canónico**. Es el consumidor de detalle del mismo contexto runtime que alimenta `ventas_product_sales_v01`.

Pregunta:

> ¿Cuáles son las ventas CIDEF ya reconocidas y resueltas al `modelo_id` solicitado dentro del período?

Inputs:

```text
modelo_id: integer
start_month: YYYY-MM
end_month: YYYY-MM
cutoff_month: YYYY-MM
```

Contrato temporal:

```text
cutoff_month = end_month
```

Dependencias compartidas:

```text
buildVentasProductContext({ cutoffMonth })
resolvedSales[]
selectProductSales()
```

Flujo determinista:

```text
ventas_context_v01
→ recognizedSales[]
→ identidad producto MASTER
→ resolvedSales[]
→ selectProductSales()
→ targetSales[]
→ serializeProductDetail()
```

Política:

- no relee `ventas_raw` ni reconstruye LAST;
- usa exactamente el mismo cutoff, reconocimiento e identidad producto que `ventas_product_sales_v01`;
- sólo expone ventas con `product_identity_status=RESOLVED` y `modelo_id` igual al target;
- ventas `UNRESOLVED` o `AMBIGUOUS` no se reasignan ni entran al detalle target; permanecen explícitas en cobertura;
- devuelve el detalle completo del target sin muestreo ni truncamiento, porque `detail.length` debe reconciliar exactamente con `target.units`;
- persistencia exclusivamente runtime.

Grain:

```text
1 fila detail = 1 venta CIDEF reconocida y resuelta al modelo target
```

Campos de `detail[]`:

```text
source_id
vin
fecha_venta
fecha_venta_iso
mes_venta
recognition_basis
nro_operacion
nro_propuesta
factura
nro_factura
producto_sku
producto
modelo_id
version_id
product_identity_status
```

Devuelve:

```text
engine
version
status
inputs
policy
target:
  modelo_id
  units
detail[]
coverage:
  recognized_sales_in_period
  product_resolved
  product_unresolved
  product_ambiguous
  aliases_loaded
  target_aliases
validation
warnings
```

Validaciones principales:

```text
ventas_context_ok
cutoff_context_match
cutoff_equals_end_month
target_model_aliases_present
no_ambiguous_product_identity
product_identity_complete_in_period
detail_units_reconcile_with_target
no_post_cutoff_evidence_used
```

Invariante de diseño para el mismo input y snapshot:

```text
ventas_product_sales_v01.target.units
=
ventas_product_detail_v01.target.units
=
ventas_product_detail_v01.detail.length
```

Este motor **no** consulta `notas_venta_raw`, no compara RVM y no interpreta arrastre/boundary. Su responsabilidad es abrir de forma auditable el conjunto de ventas ya reconocido por el pipeline certificado.

### `competitive_context_v01`

Contexto runtime determinista común para **Familia 2 — POSICIÓN COMPETITIVA**.

Pregunta base:

> ¿Cuál es el universo observable de mercado alrededor de uno o más modelos CIDEF, construido on demand desde RVM + MASTER vigente y reutilizable por motores competitivos posteriores?

Inputs:

```text
target_model_ids: bigint[]
date_from: YYYY-MM-DD
date_to: YYYY-MM-DD
geography?:
  level: region | comuna
  values: string[]
origin_group?: CHINESE | NON_CHINESE | UNKNOWN
```

Fuentes:

```text
rvm_raw
producto_aliases_v01
modelos_master_v01
marcas_master_v01
producto_portafolio_v01
data/market-origin/CL.json
```

Política:

- persistencia exclusivamente runtime; no crea tabla analítica ni lista materializada de competidores;
- unidades de mercado = `SUM(rvm_raw.cantidad)`;
- el target debe pertenecer al portafolio CIDEF vigente;
- los universos se observan desde `descripcion_segmento + descripcion_tipo + combustible` de RVM;
- el filtro `origin_group` es opcional y se deriva del lookup Chile versionado; CN→CHINESE, país mapeado no-CN→NON_CHINESE y missing→UNKNOWN;
- cuando se solicita `origin_group`, `units`, `rank`, `share` y `cumulativeShare` se recalculan dentro del peer group filtrado;
- conserva todas las combinaciones observadas del target; el builder no decide materialidad;
- la resolución de identidad contextual `RESUELTO` tiene precedencia sobre la genérica;
- para aliases RVM a nivel MODELO, `contexto_modelo_raw` se compara contra `rvm_raw.modeo_version`;
- si una entidad de mercado queda ambigua o no resuelta a MASTER, sus unidades **no desaparecen**: permanecen en el denominador con identidad RAW;
- el contexto calcula por universo `units`, `rank`, `share` y `cumulativeShare`;
- no aplica un corte Pareto ni conoce 70/75/80 como reglas;
- un consumidor posterior puede seleccionar cualquier `coverage_target` usando `cumulativeShare` sin releer RVM.

Shape principal devuelto:

```text
engine
version
status
policy
sharedContext:
  context
  version
  scope
  targets[]
  targetObservations[]
  universes[]
  identity
  validation
  warnings[]
```

Cada universo conserva su propia lista ordenada de modelos. Un mismo modelo RVM puede aparecer en universos distintos de combustible y no se deduplica antes del ranking.

Validaciones principales:

```text
requested targets vs targets CIDEF vigentes
filas y unidades RAW consideradas
unidades con identidad RESUELTA / AMBIGUA / NO_RESUELTA
correcciones negativas
cantidad != 1
reconciliación de unidades por universo
ranking/share/cumulativeShare
```

Warnings relevantes incluyen targets sin portafolio/identidad y problemas de cobertura o cantidades, sin convertirlos automáticamente en exclusiones de mercado.

Dependencia compartida:

```text
competitive_context_v01
```

Motores posteriores de Familia 2 deben recibir este contexto mediante `sharedContext` cuando ya fue construido y no volver a consultar `rvm_raw` salvo que el contexto no exista o sea incompatible con el scope solicitado.

Este motor/contexto **no define todavía competidores reales**, no incorpora microsegmento/precio y no hace afirmaciones de desplazamiento. Su responsabilidad es construir y auditar una sola vez el universo observable reusable del request.

### `competitive_share_trajectory_v01`

Motor determinista v0.2 de trayectoria mensual para **Familia 2 — POSICIÓN COMPETITIVA**.

Pregunta:

> ¿Cómo cambia mes a mes el share y ranking de los modelos dentro del mismo peer universe observable de un target CIDEF?

Inputs:

```text
target_model_ids: bigint[]
date_from: YYYY-MM-DD
date_to: YYYY-MM-DD
geography?: region | comuna
origin_group?: CHINESE | NON_CHINESE | UNKNOWN
output_mode?: trajectory | monthly   default trajectory
entity_keys?: string[]               required only for monthly; max 50
```

Política:

- reutiliza identidad RVM→MASTER y peer semantics de `competitive_context_v01`;
- fija universos sobre todo el período y calcula internamente la matriz mensual completa;
- `trajectory` es la salida compacta por defecto y NO transporta `monthly[]`;
- `monthly` exige `entity_keys` y transporta solo esas entidades;
- `entity_keys` limita transporte, no define relevancia ni competidores;
- con `origin_group`, el denominador mensual se recalcula dentro del grupo;
- entidades observadas en el período se zero-fill en meses sin inscripción: units=0, share=0, rank=null;
- no define competidores ni thresholds.

Outputs:

```text
trajectory (default):
  peerUniverses[]
  trajectory[]

monthly:
  peerUniverses[]
  monthly[] only for requested entity_keys

both:
  scope + targets + validation + warnings
```

Validaciones adicionales de monthly:

```text
requested_entity_keys
matched_entity_keys
monthly_rows_returned
entity_keys_complete
```

### `competitive_signal_backtest_v01`

Motor determinista v0.1 de backtest de señales para **Familia 2 — POSICIÓN COMPETITIVA**.

Pregunta:

> ¿Qué evidencia temporal homogénea presenta cada target × peer × universe sobre proximidad, continuidad, alternancia y dirección?

Inputs:

```text
target_model_ids: bigint[]
date_from: YYYY-MM-DD
date_to: YYYY-MM-DD
geography?: region | comuna
origin_group?: CHINESE | NON_CHINESE | UNKNOWN
output_mode?: summary | pair_detail   default summary
pair_keys?: string[]                  required only for pair_detail; max 50
```

Grain:

```text
target_model_id × peer_entity_key × peer_universe × requested period
```

Política:

- reutiliza la matriz mensual certificada de `competitive_share_trajectory_v01`; no relee RVM por peer ni redefine identidad, denominador, share, rank u origin_group;
- genera todos los pares elegibles dentro de cada peer universe y excluye únicamente el self-pair exacto;
- late entrants, disappearances, zero-fill, UNKNOWN origin y peers RAW unresolved se conservan como evidencia;
- `active` significa `observed=true`; una fila synthetic zero-fill es inactiva;
- share gap = diferencia absoluta de share en puntos porcentuales; también conserva signed gap internamente;
- crossings sólo ocurren dentro de secuencias joint-active y nunca atraviesan gaps inactivos; ties pueden mediar un crossing sin crear crossings extra;
- convergence/divergence runs usan meses calendario adyacentes joint-active; FLAT o inactividad cortan el run;
- `summary` transporta una fila compacta por par; `pair_detail` exige pair_keys y abre sólo esos pares;
- no define competitor label, score, pesos, thresholds, proximidad productiva ni persistencia productiva.

Features V0.1 por par:

```text
shareGap: months, meanPp, medianPp, stddevPopulationPp, minPp, maxPp
continuity: monthsObserved, targetActiveMonths, peerActiveMonths, jointActiveMonths, targetZeroMonths, peerZeroMonths, firstJointActiveMonth, lastJointActiveMonth
crossings: count, firstCrossingMonth, lastCrossingMonth
convergenceDivergence: run counts + longest run transitions
diagnostics.rankGap: evaluableMonths, mean, median, min, max
```

`pair_detail` agrega `monthly[]`, `crossingEvents[]`, `convergenceDivergenceRuns[]` y `activeSpans`. Co-movement y proximity episodes quedan fuera de V0.1. Persistencia exclusivamente runtime.

Validaciones incluyen targets/universos, reconciliación mensual, pair count, self-pairs, keys únicas, consistencia de universe/meses, share gaps, continuity y detail pair-key completeness. Warnings del contexto competitivo se propagan.

### `product_generation_context_v01`

Contexto read-only de identidad estructural para **MASTER PRODUCT** y habilitante de Familia 2.

Pregunta base:

> ¿Cuál es el estado canónico de la relación MODEL → GENERATION → VERSION y qué evidencia estructurada soporta o contradice cada membership?

Inputs opcionales:

```text
modelo_id: bigint
version_id: bigint
generation_id: bigint
membership_status: RESOLVED | UNRESOLVED | CONFLICT
include_evidence: boolean         default false
limit: 1..200                    default 100
```

Fuentes:

```text
modelos_master_v01
versiones_master_v01
generaciones_master_v01
version_generation_v01
generation_evidence_v01
```

Política:

- motor exclusivamente read-only; no crea generaciones, no hace backfill y no ejecuta DDL/DML;
- `version_generation_v01` es la autoridad del estado canónico VERSION→GENERATION;
- `RESOLVED` exige `generation_id` y VERSION/GENERATION deben pertenecer al mismo `modelo_id`;
- `UNRESOLVED` conserva VERSION conocida sin fabricar GENERATION;
- `CONFLICT` conserva evidencia incompatible sin seleccionar ganador;
- nunca infiere generación desde nombre, portfolio, fuel, marketing label o similitud textual;
- evidencia se devuelve solo si `include_evidence=true`;
- si las tablas GENERATION todavía no existen en la base conectada, devuelve `warning` explícito en vez de fabricar contexto.

Devuelve:

```text
engine
version
status
policy
sharedContext:
  scope
  tableState
  summary:
    version_count
    generation_count
    membership_rows
    resolved
    unresolved
    conflict
  generations[]
  versions[]
  evidence[]
  validation
  warnings[]
```

Validaciones principales:

```text
membership_covers_versions
resolved_requires_generation
nonresolved_has_no_generation
resolved_stays_inside_model
```

La migración `028_producto_generation_schema_v01.sql` inicializa una fila `UNRESOLVED` por VERSION existente y un trigger hace lo mismo para VERSION futuras. Eso mantiene el grain 1:1 sin asignar ninguna generación.

Este contexto **no define atributos físicos, competencia, precio, percentiles ni Pareto**. Su responsabilidad es exponer al agente la identidad estructural certificada antes de que otros motores consuman `length_mm`, `wheelbase_mm` u otras propiedades de generación.

### `org_sales_deterioration_backtest_v01`

Motor determinista de diagnóstico para **Familia 3 — DETERIORO Y RED FLAGS** sobre organización comercial. Versión interna actual: `0.4`.

Pregunta:

> ¿Cuándo una desviación adversa de ventas de una tienda o vendedor respecto de su propia historia deja de ser ruido puntual y pasa a mostrar persistencia?

Inputs:

```text
grain: tienda | vendedor
start_month: YYYY-MM
end_month: YYYY-MM
candidate_baselines: string[]
candidate_deviation_methods: string[]
candidate_persistence_rules: string[]
output_mode?: summary | stability | episodes | units
detail_limit?: 1..200
detail_baseline?: uno de candidate_baselines
detail_deviation_method?: uno de candidate_deviation_methods
detail_persistence_rule?: uno de candidate_persistence_rules
```

Fuentes:

```text
ventas_raw
sucursales_master
personas_master
notas_venta_raw      # sólo grain=tienda, evidencia ACTIVE_ZERO
sucursal_aliases     # sólo grain=tienda, identidad NV→sucursal
```

Dependencias compartidas:

```text
ventas_context_v01
loadOrganizationalIdentityMaps()
enrichRecognizedSales()
```

Política temporal:

- `ventas_raw` se lee una sola vez por ejecución y los cutoffs mensuales se reconstruyen en memoria;
- para cada mes objetivo `t`, la baseline usa sólo evidencia disponible hasta `t-1`;
- el real observado usa evidencia disponible hasta `t`;
- la historia anterior a `start_month` se usa como warm-up para baseline y distribución histórica de errores;
- meses futuros nunca participan en la señal ni en la confirmación; sólo se usan después para evaluar si una alarma revirtió o persistió;
- `onset_month` y `confirmation_month` se reportan por separado.

Identidad:

- tienda se resuelve por igualdad exacta `ventas_raw.id_sucursal_vta -> sucursales_master.id_sucursal_vta`;
- vendedor se resuelve por igualdad exacta `ventas_raw.nombre_usuario -> personas_master.usuario_canonico`;
- no existe fuzzy fallback;
- `persona_sucursal` vigente no se usa para reescribir la historia;
- identidad no resuelta o ambigua permanece explícita en cobertura/warnings.

Semántica de observación V0.4:

```text
TIENDA
recognized_sales > 0 → OBSERVED_POSITIVE → sales real
recognized_sales = 0 + NV > 0 → ACTIVE_ZERO → sales = 0
sin venta ni NV → UNKNOWN → no evaluable

VENDEDOR
recognized_sales > 0 → OBSERVED_POSITIVE
sin venta → UNKNOWN
ACTIVE_ZERO no se fabrica sin fuente independiente certificada
```

- UNKNOWN nunca se convierte en cero;
- las baselines consumen sólo meses realmente observados/ACTIVE_ZERO y no densifican huecos;
- UNKNOWN corta continuidad de `consecutive_k`, `frequency_n_of_k` y `deepening_k`;
- el output expone `observation_semantics` y `coverage.skipped_unknown_actual_by_baseline`;
- la identidad NV de tienda reutiliza la misma resolución MASTER y parser temporal validados por `org_sales_observation_semantics_audit_v01`.

Candidatos de baseline:

```text
last_year
adjusted_last_year
moving_average_k
median_k
```

`k` es suministrado por el caller cuando corresponde. `adjusted_last_year` reutiliza la fórmula vigente de EXPECTATIVA; el motor no inventa otra variante.

Métodos de desviación:

```text
relative
scaled_mad
historical_percentile
```

Reglas de persistencia parametrizadas:

```text
consecutive_k
frequency_n_of_k
deepening_k
```

El motor valida las expresiones y rechaza reglas `frequency_n_of_k` cuando `n > k`. Estos valores son candidatos de laboratorio, no thresholds de negocio persistidos.

Output `summary` por defecto es compacto y conserva `candidate_results` + estabilidad resumida. Los detalles se consultan con modos acotados:

```text
stability
episodes
units
```

Todos los modos de detalle aplican primero los filtros `detail_*`, luego `detail_limit`, y reportan:

```text
detail.matched_rows
detail.returned_rows
detail.truncated
```

`output_mode=units` usa grain:

```text
baseline
+ deviation_method
+ persistence_rule
+ unit_id
```

Cada fila `unit_backtests[]` devuelve:

```text
baseline
deviation_method
persistence_rule
unit_id
unit_label
identity_validated
first_evaluable_month
last_evaluable_month
baseline_evaluable_rows
deviation_evaluable_rows
deviation_unavailable_rows
deviation_unavailable_reasons:
  baseline_nonpositive
  insufficient_error_history
  zero_scale
actual_sales_avg
signal_count
signal_months[]
confirmed_episode_count
confirmation_months[]
immediate_reversal_count
immediate_reversal_rate
next_2_persistent_count
next_2_persistent_rate
next_3_persistent_count
next_3_persistent_rate
```

Semántica del resumen unitario:

- `baseline_evaluable_rows` = filas donde existe baseline para la unidad;
- `deviation_evaluable_rows` = filas donde el método solicitado produce valor no nulo;
- `deviation_unavailable_rows = baseline_evaluable_rows - deviation_evaluable_rows`;
- `baseline_nonpositive` reutiliza la condición vigente que hace `relative=null` cuando baseline `<= 0`;
- `insufficient_error_history` reutiliza la historia mínima vigente del método robusto;
- `zero_scale` identifica `scaled_mad=null` con historia suficiente y MAD/scale cero; no introduce epsilon ni threshold nuevo;
- `actual_sales_avg` usa como denominador las filas baseline-evaluable;
- `signal_count/signal_months` reutilizan exactamente `isAdverse()`; no reimplementan fórmulas;
- episodios y confirmaciones se agregan sólo desde `episode_backtests` del candidato exacto;
- tasas futuras excluyen flags desconocidos, igual que `candidate_results`.

Reconciliaciones esperadas por candidate × unit:

```text
baseline_evaluable_rows
= deviation_evaluable_rows + deviation_unavailable_rows

signal_count = signal_months.length
confirmed_episode_count = confirmation_months.length
```

La suma de `confirmed_episode_count` por unidades debe reconciliar con los episodios del mismo `baseline + deviation_method + persistence_rule`.

Validaciones principales del motor:

```text
ventas_contexts_ok
final_identity_reconciles
baseline_uses_prior_cutoff
signal_uses_no_future_labels
onset_not_after_confirmation
has_evaluable_rows
```

La versión 0.4 cambia exclusivamente la semántica de observación/missingness del backtest: elimina zero-fill implícito, incorpora ACTIVE_ZERO certificado por NV para tienda y preserva UNKNOWN como no evaluable. No cambia fórmulas de desviación, candidatos de persistencia, reconocimiento LAST-by-VIN ni identidad comercial.

El motor **no selecciona todavía la regla final de deterioro**, no define severidad comercial, no mezcla producto/RVM y no crea tabla, fact, mart ni cubo. Su responsabilidad es hacer backtesting walk-forward reproducible para descubrir qué combinación separa mejor ruido de cambio persistente.

### `org_sales_observation_semantics_audit_v01`

Capacidad determinista **AUDIT_ONLY / DISCOVERY_ONLY** para Familia 3. Versión interna actual: `0.2`. No es una nueva familia ni modifica `org_sales_deterioration_backtest_v01`.

Pregunta:

> ¿Qué cambia en el candidato fijo `last_year + relative + deepening_2` si una tienda-mes sin venta se trata como cero sólo cuando existe evidencia independiente de actividad mediante NV, y como UNKNOWN en caso contrario?

Inputs:

```text
start_month: YYYY-MM
end_month: YYYY-MM
detail_limit?: 1..200
detail_unit_id?: sucursal_id
```

Candidato fijo:

```text
grain = tienda
baseline = last_year
deviation = relative
persistence = deepening_2
```

Fuentes:

```text
ventas_raw
notas_venta_raw
sucursal_aliases
sucursales_master
```

Semántica NEW:

```text
recognized_sales > 0
→ OBSERVED_POSITIVE
→ sales = recognized_sales

recognized_sales = 0 AND nv_count > 0
→ ACTIVE_ZERO
→ sales = 0

recognized_sales = 0 AND nv_count = 0
→ UNKNOWN
→ no evaluable row
```

Política:

- escenario OLD reutiliza exactamente la construcción cutoff-safe vigente;
- escenario NEW parte de los mismos snapshots de ventas reconocidas y sólo añade `ACTIVE_ZERO` desde NV;
- `fecha_nota_de_venta` reutiliza el parser temporal certificado de ventas, sin parsing dependiente del locale;
- NV→sucursal usa exclusivamente `sucursal_aliases` con `fuente=notas_venta_raw`, `validated=true`, normalización MASTER y destino único;
- NV demuestra actividad observable pero nunca incrementa `sales`;
- UNKNOWN no se densifica ni se convierte en cero;
- UNKNOWN corta continuidad: las series sparse se segmentan antes de reutilizar `evaluateOrgCandidates`;
- NV no crea un roster nuevo: el universo se limita a tiendas ya observadas en la historia de ventas reconocidas;
- NEW reutiliza `expectedLastYear`, `calculateDeviations` y la lógica vigente de persistencia/episodios.

Output:

```text
engine
version
mode = AUDIT_ONLY
validation
nv_identity
nv_time
coverage
unit_universe
units[]
active_zero_detail
old
new
comparison
episode_comparison
new_backtest_skips
warnings
```

`coverage` agrega además:

```text
ventas_source_rows
nv_source_rows
units_total
unit_months_total
observed_positive_unit_months
active_zero_unit_months
unknown_unit_months
```

`active_zero_detail.rows[]` expone el grain auditable tienda-mes:

```text
unit_id
unit_label
month
recognized_sales
nv_count
state = ACTIVE_ZERO
sales = 0
```

El detalle aplica `detail_unit_id` antes de `detail_limit` y devuelve `matched_rows`, `returned_rows` y `truncated`.

`unit_universe` reconcilia:

```text
observed_units_total
candidate_evaluable_units
units_without_candidate_rows
units_without_candidate_rows_detail[]:
  unit_id
  unit_label
  reason
```

La diferencia entre unidades históricamente observadas y unidades con filas del candidato queda explícita; no se inventa roster ni se usa `vigente=true` como filtro retrospectivo.

`units[]` reporta:

```text
unit_id
unit_label
observed_positive_months
active_zero_months
unknown_months
first_evaluable_month
last_evaluable_month
```

`old/new` reportan:

```text
evaluable_rows
confirmed_episodes
persistent_units
persistent_unit_ids
```

Validaciones explícitas de auditabilidad V0.2:

```text
active_zero_invariant
→ cada ACTIVE_ZERO cumple recognized_sales=0, nv_count>0, state=ACTIVE_ZERO, sales=0

unknown_breaks_continuity
→ ningún episodio confirmado cruza un mes ausente/UNKNOWN entre onset y confirmation

no_future_signal_leakage
→ history cutoff < target month, actual cutoff = target month y baseline history usa sólo meses anteriores
```

Se conservan además:

```text
ventas_context_ok
nv_identity_ok
nv_time_ok
old_semantics_reconciles
unknown_preserved
```

`comparison` separa `persistent_both`, `old_only` y `new_only`. Los episodios diferenciales conservan onset, confirmation y flags futuros.

La versión `0.2` no cambia OLD, NEW, reconocimiento, identidad, baseline, desviación ni persistencia. Sólo vuelve empíricamente auditable el contrato que en `0.1` estaba parcialmente demostrado por estructura interna.

Esta capacidad conserva la evidencia diagnóstica que validó `OBSERVED_POSITIVE / ACTIVE_ZERO / UNKNOWN` antes de incorporarla a `org_sales_deterioration_backtest_v01` v0.4. Sigue siendo AUDIT_ONLY y no selecciona la regla final de deterioro.

## NOT AVAILABLE

No forman parte de la superficie actual del agente:

- `join_tables`
- `vin_olap`
- `contextual_slice`
- imports
- refresh
- operaciones MASTER/canónicas temporales
- DDL/DML
- SQL libre

Pueden existir internamente en el repositorio o en el router multi-tenant, pero el agente no debe asumir que están disponibles.

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

Después de implementado y validado, ese motor puede incorporarse a la superficie dedicada del agente si resulta útil para seguir diseñando o probando familias superiores.
