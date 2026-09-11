# RVM — Dominio analítico

Estado documental: `CURRENT`

Este documento explica el dominio analítico **RVM** tal como existe hoy en el runtime CIDEF.

No redefine contratos ejecutables ni reglas operativas. La autoridad del comportamiento está en código productivo; la superficie pública está definida por `rom/schema.json`; las reglas de negocio y comparabilidad viven en `rom/business-rules.md`.

## 1. Responsabilidad

RVM responde preguntas sobre **mercado, participación, posición y contexto competitivo** a partir de matriculaciones RVM y autoridades certificadas de identidad y pertenencia.

Según la capability utilizada, permite analizar:

- tamaño y evolución del mercado;
- trayectoria de una entidad;
- market share;
- ranking/posición;
- relaciones competitivas observadas;
- movimientos inversos de share;
- contrapartes competitivas candidatas;
- crecimiento CIDEF versus benchmarks de mercado;
- historia del mercado.

RVM describe matriculaciones. No describe por sí solo ventas internas, canal comercial CIDEF, CRM ni causalidad competitiva.

## 2. Frontera pública

El dominio conceptual es:

```text
RVM
```

La superficie pública mantiene por compatibilidad el namespace:

```text
MARKET
```

y el endpoint:

```text
POST /api/custom-gpt/market
```

El agente invoca:

```text
MARKET + capability + input
```

El backend resuelve esa capability al motor físico correspondiente. El agente no debe seleccionar nombres físicos de motores ni reconstruir universos de modelos cuando la capability puede resolver una entidad de negocio.

## 3. Universo analítico certificado

La frontera interna central es:

```text
rvm_universe_v01
```

Es un dataset analítico certificado de runtime. No es una capability pública, contexto narrativo ni una tabla materializada que el agente deba consultar directamente.

Su preparación conceptual es:

```text
RVM fuente
→ resolución certificada de identidad
→ resolución temporal de organización
→ rvm_universe_v01
→ analytical_events
→ familias RVM
```

El universo compone autoridades existentes. No redefine identidad, medidas de mercado, universos competitivos ni pertenencia organizacional.

## 4. Qué entrega el universo

Cada evento analítico preserva, según disponibilidad y contrato:

- fecha y cantidad;
- año/mes analítico;
- marca/modelo/versión RAW para auditoría;
- `brand_id` / `brand_name` canónicos;
- `model_id` / `model_name` canónicos;
- estado y método de resolución de identidad;
- organización y método de resolución;
- dimensiones RVM como segmento, tipo, región, comuna y combustible;
- cobertura y lineage necesarios para validar el resultado.

La identidad y pertenencia se resuelven upstream para evitar que cada familia repita joins o normalizaciones.

## 5. NO RECONSTRUCTION

Una familia RVM que consume universo certificado no debe:

```text
releer RVM RAW
→ normalizar nombres ad hoc
→ reconstruir marca/modelo
→ reconstruir pertenencia organizacional
→ decidir manualmente qué IDs pertenecen a una entidad
```

Debe operar como:

```text
entidad / scope / filtros públicos
→ backend resuelve autoridades certificadas
→ universo preparado
→ cálculo determinista
→ resultado
```

Esto es especialmente importante para preguntas naturales como:

```text
¿Cuánto creció el share de Foton?
```

Cuando la capability pública soporta una entidad de negocio, el agente debe enviar esa entidad y permitir que backend resuelva su identidad y pertenencia. No debe buscar y reconstruir manualmente `target_model_ids`.

## 6. Organization scope

RVM posee una dimensión organizacional propia:

```text
organization_scope
```

El enum público certificado actual es:

```text
ALL
CIDEF
INDUMOTORA
MACO_TATTERSALL
```

`organization_scope` es independiente de `commercial_universe` de VENTAS.

No debe inferirse uno desde el otro.

Para queries RVM product-scoped por marca o modelo, el contrato longitudinal exige `organization_scope` explícito. La pertenencia temporal la resuelve backend/MASTER, no el LLM.

## 7. CIDEF: frontera crítica de atribución

RVM distingue dos semánticas de atribución CIDEF que no deben mezclarse.

### Detalle competitivo / producto / modelo

Para detalle RVM CIDEF, la autoridad vigente es estricta:

```text
rvm_raw.marca = DFM
```

Por lo tanto, `organization_scope=CIDEF` en el universo detail-capable incluye sólo observaciones RAW DFM bajo la regla certificada.

Identidad canónica DONGFENG, aliases, pertenencia de modelo o reglas históricas agregadas **no autorizan** por sí mismas incluir otra marca RAW como detalle CIDEF.

En particular, continuidad histórica agregada no convierte ZNA en DFM ni autoriza continuidad de producto/modelo.

### Agregado histórico

Existen reglas históricas certificadas con:

```text
aggregation_scope = BRAND_AGGREGATE
```

que pueden aportar a un total histórico agregado CIDEF cuando el consumidor explícitamente soporta esa semántica.

Estas reglas:

- sirven sólo para agregado histórico autorizado;
- no resuelven producto/modelo;
- no alimentan identidad competitiva de detalle;
- no deben mezclarse con la atribución DFM-only de detalle.

## 8. Entidad vs universo de mercado

La entidad analizada y el universo usado como denominador son conceptos distintos.

Ejemplo:

```text
entity = FOTON
```

identifica el sujeto de análisis.

No significa automáticamente:

```text
market universe = FOTON
```

ni cambia por sí solo el denominador de market share.

Los filtros explícitos de universo son los que restringen el mercado comparable cuando el contrato de la capability lo permite.

Esta separación evita que seleccionar una marca modifique silenciosamente la referencia contra la cual se calcula su posición.

## 9. Identidad de marca y modelo

La identidad de negocio debe resolverse mediante autoridades certificadas.

La superficie pública actual de `SHARE_TRAJECTORY` permite dos contratos:

1. contrato legacy basado en `target_model_ids`;
2. contrato preferente para trayectoria canónica de marca:

```text
entity = { brand | brand_id }
+ organization_scope explícito
```

Para una pregunta natural de marca, el segundo patrón evita exponer al agente a IDs físicos o exigirle reconstruir marca → modelos.

La existencia del contrato legacy mantiene compatibilidad; no convierte la reconstrucción manual de IDs en el flujo recomendado.

## 10. Capabilities públicas actuales

La superficie `MARKET` registrada actualmente contiene:

| Capability | Motor físico | Responsabilidad resumida |
|---|---|---|
| `COMPETITIVE_CONTEXT` | `competitive_context_v01` | Contexto competitivo preparado para interpretar entidad y mercado relevante. |
| `SHARE_TRAJECTORY` | `competitive_share_trajectory_v01` | Trayectoria de share/posición bajo universo y entidad certificados. |
| `COMPETITIVE_RELATION` | `competitive_relation_v01` | Relación determinista entre trayectorias competitivas compatibles. |
| `INVERSE_SHARE_MOVEMENT` | `competitive_inverse_share_movement_v01` | Movimiento inverso observado entre shares compatibles. |
| `SHARE_TRANSFER` | `competitive_share_transfer_v01` | Identifica contrapartes competitivas candidatas a partir de movimientos compatibles; no demuestra transferencia causal de VIN. |
| `GROWTH_MATRIX` | `competitive_growth_matrix_v01` | Compara crecimiento CIDEF VENTAS COMPANY contra benchmarks RVM compatibles. |
| `MARKET_HISTORY` | `rvm_market_history_v01` | Historia del mercado bajo dimensiones y períodos soportados. |

La lista ejecutable vigente es `lib/custom-gpt/capabilityRegistry.js`. Este documento debe actualizarse si el registry cambia.

## 11. SHARE_TRAJECTORY

`SHARE_TRAJECTORY` responde preguntas de evolución de share y posición.

Para marca canónica, el flujo preferente es:

```text
pregunta natural
→ entity { brand | brand_id }
→ organization_scope
→ backend resuelve identidad/pertenencia
→ trayectoria certificada
→ agente interpreta
```

No:

```text
pregunta natural
→ agente busca modelos físicos
→ agente arma target_model_ids
→ agente reconstruye universo
→ motor
```

El contrato legacy de `target_model_ids` sigue disponible para compatibilidad model-peer cuando corresponde.

## 12. SHARE_TRANSFER

`SHARE_TRANSFER` busca movimientos competitivos compatibles y permite identificar una:

```text
CANDIDATE_COMPETITIVE_COUNTERPART
```

cuando sujeto y peer usan universo, período, estado de datos y corte temporal compatibles.

La capability puede describir:

- magnitud;
- repetición;
- consistencia;
- movimiento inverso observado.

No demuestra:

- causalidad;
- VIN transferidos;
- clientes capturados desde un competidor específico.

Persistencia fuerte sólo puede declararse cuando existen thresholds explícitos certificados por el request/contrato correspondiente.

## 13. GROWTH_MATRIX: frontera cross-domain

`GROWTH_MATRIX` es una capability competitiva que combina dos medidas distintas bajo un contrato explícito:

```text
CIDEF_MEASURE     = VENTAS COMPANY
BENCHMARK_MEASURE = RVM
```

El numerador CIDEF proviene de:

```text
ventas_universe_v01[commercial_universe=COMPANY]
```

El benchmark proviene de:

```text
rvm_universe_v01[organization_scope=ALL]
```

La capability compara:

- crecimiento;
- cambio absoluto;
- dirección;
- diferencial de crecimiento cuando es evaluable.

Está prohibido interpretar:

```text
VENTAS_COMPANY / RVM_REGISTRATIONS
```

como market share.

Venta interna e inscripción RVM son medidas distintas aunque puedan compararse por variación bajo el contrato certificado.

## 14. Mercado chino

Para las capabilities cross-domain donde existe `CHINESE_MARKET`, la autoridad certificada es:

```text
marcas_master_v01.origin_group = CHINESE
```

No debe usarse `pais_vin` para decidir si una marca pertenece al mercado chino en esas capabilities.

Esto es distinto del filtro interno `origin` de `rvm_universe_v01`, que conserva una dimensión fuente mapeada a `rvm_raw.pais_vin` y no crea por sí misma una clasificación `CHINESE_MARKET`.

Por lo tanto:

```text
origin / pais_vin
≠
origin_group / CHINESE_MARKET
```

Son conceptos diferentes y deben permanecer separados.

## 15. Tiempo y comparabilidad

RVM conserva mes calendario para sus eventos de mercado.

Cuando una capability combina RVM con VENTAS, debe respetar las autoridades temporales de cada fuente.

En `GROWTH_MATRIX`, por ejemplo:

- RVM conserva mes calendario;
- VENTAS puede consumir `mes_venta` comercial certificado para comparaciones mensuales específicas;
- el diferencial compara tasas resultantes, no declara equivalencia física entre ambas medidas.

Para `CURRENT_MTD`, la comparación sólo es evaluable cuando existe un snapshot preliminar único compatible y un cutoff común según el contrato vigente.

Un período incompleto no equivale a cierre.

## 16. Longitudinal RVM

`LONGITUDINAL` es un modo temporal transversal, no un dominio adicional.

Para RVM soporta actualmente métricas como:

```text
MARKET_SIZE
ENTITY_VIN
MARKET_SHARE
RANK
```

con series temporales, numerator/denominator cuando aplica, ranking, cutoff, cobertura y warnings bajo su contrato.

Las consultas product-scoped por `BRAND` o `MODEL` requieren `organization_scope` explícito.

La selección de entidad y los filtros de universo permanecen separados.

## 17. Cobertura y no evaluabilidad

El universo expone cobertura basada en cantidad para aspectos como:

- identidad de producto;
- resolución organizacional;
- disponibilidad de dimensiones fuente relevantes.

Las particiones de cobertura deben reconciliar con el total correspondiente.

Filas unresolved/ambiguous no se convierten silenciosamente en identidad válida. Deben permanecer visibles mediante estados, cobertura o warnings según el contrato.

Una fuente no evaluable no demuestra ausencia del fenómeno.

## 18. Qué RVM no permite afirmar por sí solo

RVM no permite concluir automáticamente:

```text
share ↓             = deterioro comercial CIDEF
share inverso       = VIN transferidos
mercado ↑           = oportunidad capturable
ranking ↓           = mala gestión
crecimiento mercado = ventas futuras garantizadas
```

Estas conclusiones requieren semántica y, cuando corresponda, evidencia compatible de VENTAS, CRM, trayectoria o referencias adicionales.

La transformación desde evidencia a `oportunidad`, `riesgo`, `deterioro`, `ventaja`, `red flag` o `prioridad` ocurre después del cálculo determinista.

## 19. Qué no pertenece a este documento

Este documento no describe:

- ingesta RVM;
- loaders;
- limpieza/publicación RAW;
- refresh de MASTER;
- construcción de aliases;
- rebuild de tablas;
- diseños futuros no implementados.

Para efectos de esta documentación, las autoridades consumidas por el runtime se consideran entradas disponibles.

## 20. Autoridades relacionadas

```text
lib/custom-gpt/capabilityRegistry.js
  → mapping público MARKET capability → motor

rom/schema.json
  → contrato público de MARKET/RVM

rom/business-rules.md
  → reglas competitivas, organización, territorio y comparabilidad

rom/business-semantics.md
  → nivel de conclusión permitido por la evidencia

rom/orchestrator.md
  → selección y coordinación de capabilities

docs/architecture/RVM_ANALYTICAL_UNIVERSE_V0.1.md
  → contrato documental detallado de rvm_universe_v01

docs/agent/README.md
  → arquitectura general del agente
```

## 21. Resumen de invariantes RVM

1. RVM describe matriculaciones de mercado; no ventas internas CIDEF.
2. El dominio conceptual es RVM aunque la superficie pública se llame `MARKET`.
3. `rvm_universe_v01` concentra identidad y pertenencia certificadas para consumidores compatibles.
4. El agente no reconstruye identidad, membership ni listas físicas de modelos cuando backend puede resolver una entidad de negocio.
5. `organization_scope` es independiente de `commercial_universe`.
6. Entidad analizada y universo/denominador de mercado son conceptos distintos.
7. CIDEF detail competitivo es DFM-only; agregado histórico tiene una autoridad separada y no habilita detalle.
8. ZNA histórico agregado no se transforma en DFM ni en continuidad de producto/modelo.
9. Movimiento inverso de share no demuestra transferencia causal de VIN.
10. `GROWTH_MATRIX` compara crecimiento de VENTAS COMPANY con RVM; su ratio no es market share.
11. `CHINESE_MARKET` usa `origin_group=CHINESE`; `pais_vin/origin` es otra dimensión.
12. RVM conserva sus propias semánticas temporales y las capabilities cross-domain deben preservar diferencias entre fuentes.
13. Una métrica RVM no autoriza por sí sola una conclusión semántica fuerte.
14. Cobertura, unresolved y no evaluabilidad deben permanecer explícitos.
