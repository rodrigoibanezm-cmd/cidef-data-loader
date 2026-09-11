# CIDEF — Mapa de capabilities

Estado documental: `CURRENT`

Este documento describe la **capa pública de capabilities** del runtime CIDEF: la frontera entre la intención del agente y los motores deterministas.

Su pregunta central es:

> ¿Qué capability existe, qué pregunta responde, qué evidencia necesita y qué garantiza?

No reemplaza los contratos ejecutables. La autoridad del mapping es `lib/custom-gpt/capabilityRegistry.js`; los inputs públicos expuestos al agente se gobiernan mediante `rom/schema.json` y validaciones runtime específicas.

## 1. Modelo

El agente no selecciona tablas ni nombres físicos de motores.

Selecciona una capacidad semántica:

```text
pregunta
→ intención
→ dominio o capa transversal
→ capability pública
→ input conceptual válido
→ backend
→ motor determinista
→ resultado estructurado
```

El registry resuelve:

```text
domain + capability
→ action/motor físico
```

Esta indirección permite cambiar implementación interna sin obligar al agente a conocerla.

## 2. Dos tipos de superficie

La arquitectura actual distingue entre **dominios analíticos canónicos** y **capas transversales/auxiliares**.

### Dominios analíticos canónicos

```text
VENTAS
RVM
CRM
```

Sus namespaces públicos actuales son:

```text
SALES  → VENTAS
MARKET → RVM
CRM    → CRM
```

### Capas transversales o auxiliares

```text
PRICING
LONGITUDINAL
DISCOVERY
```

Estas superficies aportan capacidades que no deben confundirse con un cuarto, quinto o sexto dominio analítico canónico.

- `PRICING` aporta evidencia de condición comercial publicada vinculada a identidad de producto y VIN facturados.
- `LONGITUDINAL` aporta lectura temporal sobre VENTAS, RVM y CRM.
- `DISCOVERY` aporta inspección controlada cuando falta una capability encapsulada o se requiere evidencia estructural.

## 3. Inventario público actual

El registry contiene actualmente **34 mappings públicos**.

| Superficie | Capabilities |
|---|---:|
| `SALES` / VENTAS | 17 |
| `MARKET` / RVM | 7 |
| `CRM` | 2 |
| `PRICING` | 1 |
| `LONGITUDINAL` | 3 |
| `DISCOVERY` | 4 |
| **Total** | **34** |

La lista ejecutable vigente siempre debe verificarse contra `lib/custom-gpt/capabilityRegistry.js`.

## 4. VENTAS / SALES

VENTAS responde por resultado y desempeño comercial CIDEF.

| Capability | Motor | Pregunta que habilita |
|---|---|---|
| `COMMERCIAL_CONTEXT` | `ventas_commercial_context_v01` | ¿Cuál es el contexto/pertenencia comercial certificada del resultado? |
| `MONTHLY_ACTUAL` | `ventas_monthly_actual_v01` | ¿Cuántos VIN observados tiene el período mensual solicitado? |
| `DAILY_CLOSE_FORECAST` | `daily_close_forecast_v01` | ¿Qué cierre proyecta el modelo determinista desde el estado intramensual? |
| `CURRENT_MONTH_CLOSE_FORECAST` | `current_month_close_forecast_v01` | ¿Qué lectura de cierre corresponde al mes corriente? |
| `PREDICTABILITY_DAY` | `predictability_day_v01` | ¿Desde qué momento el cierre adquiere predictibilidad bajo el modelo certificado? |
| `INTRAMONTH_HISTORY` | `intramonth_sales_history_context_v01` | ¿Cómo se construye históricamente el cierre dentro del mes? |
| `PACE_CHANGE` | `sales_pace_change_v01` | ¿Cambió el ritmo observado de ventas? |
| `PRODUCT_SALES` | `ventas_product_sales_v01` | ¿Cuántos VIN vendió un producto/modelo? |
| `PRODUCT_DETAIL` | `ventas_product_detail_v01` | ¿Cómo se descompone el resultado de un producto? |
| `PRODUCT_CONCENTRATION` | `ventas_product_concentration_v01` | ¿Qué tan concentrado está el resultado por producto? |
| `PRODUCT_CHANGE_CONTRIBUTION` | `ventas_product_change_contribution_v01` | ¿Qué productos explican aritméticamente el cambio observado? |
| `STORE_CHANGE_CONTRIBUTION` | `ventas_store_change_contribution_v01` | ¿Qué tiendas contribuyen al cambio observado? |
| `SELLER_CHANGE_CONTRIBUTION` | `ventas_seller_change_contribution_v01` | ¿Qué vendedores contribuyen al cambio observado? |
| `VIN_GAP` | `vin_gap_v01` | ¿Cuál es la brecha VIN contra una referencia compatible? |
| `VIN_GROWTH_DIAGNOSTIC` | `vin_growth_diagnostic_v01` | ¿Cómo se estructura el crecimiento VIN observado? |
| `RELATIVE_PERFORMANCE` | `organizational_relative_performance_v01` | ¿Cómo rinde una unidad frente a pares compatibles? |
| `DETERIORATION_STATUS` | `org_sales_deterioration_status_v01` | ¿Existe deterioro determinista bajo el contrato implementado? |

### Garantía de la capa

Las capabilities VENTAS compatibles calculan sobre autoridades preparadas y no autorizan al agente a reconstruir reconocimiento VIN, MASTER o membership comercial.

`commercial_universe` debe respetar los contratos `COMPANY`, `OWN_STORES` o `DEALERS` aplicables a cada capability.

Una métrica no implica automáticamente una conclusión semántica más fuerte. Por ejemplo, `PACE_CHANGE=STABLE` no significa buen desempeño ni ausencia de riesgo.

## 5. RVM / MARKET

RVM responde por mercado, share y posición competitiva.

| Capability | Motor | Pregunta que habilita |
|---|---|---|
| `COMPETITIVE_CONTEXT` | `competitive_context_v01` | ¿Cuál es el contexto competitivo relevante para interpretar una entidad? |
| `SHARE_TRAJECTORY` | `competitive_share_trajectory_v01` | ¿Cómo evolucionan share y posición de la entidad? |
| `COMPETITIVE_RELATION` | `competitive_relation_v01` | ¿Qué relación determinista existe entre trayectorias compatibles? |
| `INVERSE_SHARE_MOVEMENT` | `competitive_inverse_share_movement_v01` | ¿Existen movimientos inversos de share entre entidades compatibles? |
| `SHARE_TRANSFER` | `competitive_share_transfer_v01` | ¿Qué contrapartes competitivas aparecen como candidatas por movimientos compatibles? |
| `GROWTH_MATRIX` | `competitive_growth_matrix_v01` | ¿Cómo crece CIDEF frente a benchmarks RVM compatibles? |
| `MARKET_HISTORY` | `rvm_market_history_v01` | ¿Cómo ha evolucionado el mercado bajo dimensiones soportadas? |

### Garantía de la capa

La entidad analizada y el universo/denominador son conceptos separados.

Cuando una capability puede resolver una entidad de negocio, el agente debe preferir esa identidad semántica y no reconstruir listas físicas de modelos.

`SHARE_TRAJECTORY`, por ejemplo, soporta trayectoria canónica de marca mediante `entity={brand|brand_id}` y `organization_scope` explícito, además de mantener el contrato legacy `target_model_ids` para compatibilidad.

Movimiento inverso no equivale a transferencia causal de VIN. `GROWTH_MATRIX` compara crecimiento de VENTAS COMPANY con RVM; su ratio no es market share.

## 6. CRM

CRM responde por demanda, gestión y conversión observable.

| Capability | Motor | Pregunta que habilita |
|---|---|---|
| `CONTEXT` | `crm_context_v01` | ¿Cuál es el BIG_PICTURE CRM del período, bajo reloj de demanda u operación? |
| `LONGITUDINAL_CONTEXT` | `crm_longitudinal_context_v01` | ¿Cómo evoluciona temporalmente una métrica CRM bajo EVENT o COHORT? |

### Garantía de la capa

`CRM / CONTEXT` opera sobre `crm_universe_v01`, usa `OWN_STORES` por defecto y permite `COMPANY` sólo de forma explícita. DEALERS no está certificado.

`ASSIGNED_AT` y `CREATED_AT` responden preguntas distintas. Current state de una cohorte histórica no equivale a snapshot histórico.

## 7. PRICING — capa transversal

`PRICING` se documenta como **capa transversal**, no como dominio analítico canónico adicional.

Su responsabilidad actual es conectar:

```text
identidad MASTER de producto
+ episodios canónicos de condición comercial publicada
+ VIN facturados asociados al episodio
→ historia comercial determinista
```

Capability pública registrada:

| Capability | Motor | Pregunta que habilita |
|---|---|---|
| `HISTORY` | `pricing_history_v01` | ¿Cómo evolucionó la condición comercial publicada de una versión y cuántos VIN se facturaron bajo cada episodio? |

### Identidad

`HISTORY` acepta actualmente:

```text
version_id
```

o identidad completa:

```text
brand + model + version
```

La resolución se realiza contra MASTER y debe producir exactamente una versión. Los estados de error explícitos incluyen versión inexistente o identidad ambigua.

### Autoridades

```text
producto       → MASTER
episodios      → price_episode_canonico_v01
VIN/episodio   → price_episode_vin_v01
```

La capability no reconstruye episodios desde listas de precio crudas.

### Semántica de precio

La evidencia representa:

```text
PUBLISHED_COMMERCIAL_CONDITION
```

No representa precio final realizado de la transacción.

El output declara explícitamente:

```text
price_realized_available = false
```

Por lo tanto, la capability no autoriza inferir:

- precio efectivamente pagado;
- descuento final negociado;
- margen;
- rentabilidad;
- causalidad entre cambio de precio y venta.

### Episodios

Los tipos de cambio certificados son:

```text
INITIAL
NO_CHANGE
PRECIO
BONO
PRECIO_Y_BONO
SOURCE_CONFLICT
```

Cada episodio puede exponer condición publicada, deltas, vigencia, evidencia de fuente y VIN facturados.

Un `SOURCE_CONFLICT` no se resuelve arbitrariamente y no puede contener VIN asignados bajo el contrato actual.

### Ventana temporal

El filtro de fecha utiliza:

```text
EPISODE_OVERLAP
```

El output distingue:

```text
vin_facturados
→ VIN del episodio completo

vin_facturados_en_periodo
→ VIN dentro de la intersección con el período solicitado
```

Esta diferencia debe preservarse al interpretar el resultado.

### Cobertura

La cobertura actual es deliberadamente `PARTIAL` para métricas que requerirían un universo de VIN no asignados que las autoridades canónicas de pricing no entregan.

No se inventan:

```text
vin_before_first_episode
vin_in_conflict_window
coverage_ratio
```

cuando no son derivables.

## 8. LONGITUDINAL — capa temporal transversal

`LONGITUDINAL` no es un cuarto dominio. Selecciona un dominio canónico y ejecuta su contexto temporal certificado.

| Capability | Motor | Función |
|---|---|---|
| `VENTAS` | `ventas_longitudinal_context_v01` | Evidencia temporal de VENTAS. |
| `RVM` | `rvm_longitudinal_context_v01` | Evidencia temporal de mercado/RVM. |
| `CRM` | `crm_longitudinal_context_v01` | Evidencia temporal CRM. |

Conceptualmente:

```text
LONGITUDINAL
→ dominio = VENTAS | RVM | CRM
→ métrica
→ grain
→ filtros
→ período
→ serie certificada
```

El modo longitudinal se activa cuando la evolución temporal puede cambiar la interpretación; no debe pedirse automáticamente en toda pregunta analítica.

## 9. DISCOVERY — capa auxiliar

`DISCOVERY` no es dominio analítico.

Capabilities públicas:

| Capability | Motor | Función |
|---|---|---|
| `LIST_TABLES` | `list_tables` | Inventario de tablas autorizadas. |
| `TABLE_SCHEMA` | `table_schema` | Estructura de una tabla autorizada. |
| `PROFILE_TABLE` | `profile_table` | Perfil controlado de datos. |
| `QUERY_TABLE` | `query_table` | Consulta controlada sin SQL libre. |

Secuencia típica:

```text
LIST_TABLES
→ TABLE_SCHEMA
→ PROFILE_TABLE
→ QUERY_TABLE
```

DISCOVERY se usa cuando falta evidencia estructural o una relación todavía no está encapsulada por una capability pública.

No debe utilizarse para reconstruir manualmente una capability que ya existe.

## 10. Contexto vs familia

Una capability de contexto y una capability analítica cumplen responsabilidades diferentes.

La arquitectura conserva:

```text
CONTEXTO ─────────────────────────→ AGENTE

UNIVERSO CERTIFICADO
→ FAMILIA / CAPABILITY
→ RESULTADO ──────────────────────→ AGENTE
```

El contexto no entra como input oculto del cálculo determinista.

El agente integra ambos outputs después.

## 11. Composición cross-domain

Algunas capabilities pueden estar registradas bajo una superficie pero combinar autoridades de más de un dominio.

Ejemplo:

```text
MARKET / GROWTH_MATRIX
```

combina:

```text
VENTAS COMPANY
vs
RVM benchmark
```

Esto no elimina la frontera entre dominios. La capability de composición debe declarar qué medida usa de cada autoridad y qué comparación está autorizada.

Fuera de una capability de composición explícita, la integración cross-domain ocurre en el agente sobre resultados deterministas compatibles.

## 12. Qué debe decidir el agente

Antes de invocar una capability, el agente debe poder responder:

```text
1. ¿Qué pregunta de negocio intento resolver?
2. ¿Qué dominio o capa tiene autoridad sobre esa evidencia?
3. ¿Cuál es la capability pública mínima suficiente?
4. ¿Qué scope/universo corresponde?
5. ¿Qué entidad y período corresponden?
6. ¿Necesito contexto o longitudinal para interpretar el resultado?
```

No debe partir desde:

```text
¿qué tabla puedo consultar?
¿qué motor físico conozco?
¿qué IDs puedo reconstruir?
```

## 13. Qué garantiza una capability

Una capability garantiza únicamente aquello definido por su contrato.

Puede garantizar, según el caso:

- universo;
- identidad;
- métrica;
- grain;
- ventana temporal;
- reconciliación;
- cobertura;
- estado evaluable/no evaluable;
- provenance.

No garantiza automáticamente una conclusión de negocio.

```text
resultado determinista
→ business semantics
→ síntesis
```

La semántica posterior determina si la evidencia alcanza para hablar de señal, deterioro, oportunidad, riesgo, ventaja, red flag o prioridad.

## 14. Errores y evidencia insuficiente

El runtime debe preferir estados explícitos frente a reconstrucción o relleno silencioso.

Patrones válidos incluyen:

```text
UNRESOLVED
AMBIGUOUS
NOT_APPLICABLE
NOT_EVALUABLE
PARTIAL
SOURCE_CONFLICT
```

La ausencia de evidencia suficiente no se convierte en cero, normalidad ni conclusión negativa salvo que el contrato lo autorice.

## 15. Autoridades

```text
lib/custom-gpt/capabilityRegistry.js
  → inventario ejecutable domain + capability → motor

lib/custom-gpt-router.js
  → actions físicas y ejecución runtime

rom/schema.json
  → superficie pública expuesta al agente donde está declarada

rom/intake.md
  → pregunta → intención → capability necesaria

rom/orchestrator.md
  → coordinación de capabilities y dominios

rom/business-rules.md
  → scopes, universos y comparabilidad

rom/business-semantics.md
  → significado de negocio permitido por la evidencia

docs/agent/README.md
  → arquitectura del agente

docs/domains/ventas/README.md
  → contrato conceptual VENTAS

docs/domains/rvm/README.md
  → contrato conceptual RVM

docs/domains/crm/README.md
  → contrato conceptual CRM
```

## 16. Nota de consistencia pública

El registry y el runtime contienen actualmente:

```text
PRICING / HISTORY
→ pricing_history_v01
```

y existe el endpoint:

```text
/api/custom-gpt/pricing
```

Sin embargo, la versión actual de `rom/schema.json` (`1.62.0`) no declara ese path/schema de PRICING en su superficie OpenAPI, aunque sí declara que los dominios analíticos canónicos son VENTAS, RVM y CRM.

Esto debe interpretarse como una **desalineación documental/contractual de la superficie pública**, no como inexistencia del runtime PRICING. Mientras no se corrija, la autoridad ejecutable de PRICING es el registry + endpoint + validación runtime de `pricing_history_v01`.

Este documento no modifica `rom/`; sólo hace explícita la diferencia observada.

## 17. Invariantes de la capa

1. El agente selecciona capabilities públicas, no motores físicos.
2. VENTAS, RVM y CRM son dominios analíticos canónicos.
3. PRICING es una capa transversal de condición comercial/producto, no un cuarto dominio canónico.
4. LONGITUDINAL es una capa temporal transversal sobre VENTAS/RVM/CRM.
5. DISCOVERY es auxiliar.
6. Una capability calcula sólo aquello definido por su contrato.
7. Identidad y membership certificados no se reconstruyen downstream.
8. Scope y entidad se fijan antes de interpretar métricas.
9. Composición cross-domain requiere contrato explícito o integración posterior en el agente.
10. Una métrica determinista no equivale automáticamente a una conclusión de negocio.
11. Cobertura insuficiente debe permanecer explícita.
12. Conflictos de fuente no se resuelven arbitrariamente.
13. PRICING describe condición comercial publicada, no precio realizado.
14. El registry ejecutable es la autoridad sobre qué mappings existen en runtime.
