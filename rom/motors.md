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
```

Fuentes:

```text
rvm_raw
producto_aliases_v01
modelos_master_v01
marcas_master_v01
producto_portafolio_v01
```

Política:

- persistencia exclusivamente runtime; no crea tabla analítica ni lista materializada de competidores;
- unidades de mercado = `SUM(rvm_raw.cantidad)`;
- el target debe pertenecer al portafolio CIDEF vigente;
- los universos se observan desde `descripcion_segmento + descripcion_tipo + combustible` de RVM;
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