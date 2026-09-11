# CRM — Dominio analítico

Estado documental: `CURRENT`

Este documento explica el dominio analítico **CRM** tal como existe hoy en el runtime CIDEF.

No redefine contratos ejecutables ni reglas operativas. La autoridad del comportamiento está en código productivo; la superficie pública está definida por `rom/schema.json`; las reglas de negocio y semántica viven en `rom/`.

## 1. Responsabilidad

CRM responde preguntas sobre **demanda, gestión comercial y conversión observable** a partir de leads CRM preparados bajo identidad y pertenencia certificadas.

Según la capability utilizada, permite analizar:

- leads creados;
- leads asignados;
- gestión y no gestión;
- resultados observables;
- conversión;
- estado comercial observable;
- producto de interés;
- origen y suborigen;
- tienda y vendedor cuando existe identidad certificada;
- evolución temporal de estas métricas.

CRM no representa ventas VIN ni mercado RVM. Tampoco reconstruye el estado histórico completo de un lead cuando la fuente no preserva sus transiciones.

## 2. Frontera pública

El dominio conceptual y el namespace público coinciden:

```text
CRM
```

Endpoint público:

```text
POST /api/custom-gpt/crm
```

El agente invoca:

```text
CRM + capability + input
```

El backend resuelve la capability al motor físico correspondiente. El agente no debe consultar RAW ni reconstruir identidad de tienda, vendedor o producto para responder una pregunta cubierta por las capabilities públicas.

## 3. Universo analítico certificado

La frontera interna central es:

```text
crm_universe_v01
```

Es un dataset analítico certificado de runtime. No es una capability pública ni una tabla materializada que el agente deba consultar directamente.

Su preparación conceptual es:

```text
CRM fuente
→ deduplicación defensiva por CRM ID
→ normalización temporal
→ resolución canónica de producto / tienda / vendedor
→ elegibilidad VENDEDOR_CIDEF date-effective
→ crm_universe_v01
→ familias CRM
```

El universo no reconstruye estado histórico CRM inexistente en la fuente.

## 4. Grain y deduplicación

El grain analítico es:

```text
1 evento analítico por CRM lead ID deduplicado
```

La deduplicación preserva la política vigente:

- último `loaded_at` parseable primero;
- `ctid` como tie-break técnico estable;
- IDs nulos/vacíos se mantienen defensivamente aislados por `ctid`.

Los consumidores downstream no deben volver a deduplicar ni alterar este grain.

## 5. Universo comercial CRM

CRM soporta actualmente:

```text
OWN_STORES
COMPANY
```

### OWN_STORES

Es el universo normal para análisis comercial CIDEF.

Incluye sólo leads cuya `Sucursal Asignada` resuelve mediante la autoridad canónica de sucursales y cuyo `tipo_canal = CIDEF`.

### COMPANY

Incluye el universo CRM deduplicado más amplio y debe solicitarse explícitamente cuando se necesita ese scope, incluyendo asignaciones no-store o no resueltas según el contrato vigente.

### DEALERS

```text
UNSUPPORTED / NOT EVALUABLE
```

CRM no posee actualmente identidad dealer certificada suficiente para atribución determinista.

No existe fallback de DEALERS a COMPANY ni a OWN_STORES.

`Empresa` en CRM RAW no es autoridad de `commercial_universe`.

## 6. Identidad de producto

La identidad de producto proviene de:

```text
Producto de interes
```

utilizando las autoridades certificadas existentes de aliases y MASTER.

El campo RAW `Marca` no es autoridad de identidad canónica de marca.

Los eventos preservan evidencia de resolución, incluyendo cuando corresponde:

- producto de interés RAW/normalizado;
- cantidad de matches;
- brand/model IDs y nombres canónicos;
- estado de resolución.

El agente no debe inferir marca desde texto libre cuando backend ya dispone de esta resolución.

## 7. Identidad de tienda y vendedor

### Tienda

`Sucursal Asignada` se resuelve mediante la autoridad canónica de sucursales.

### Vendedor

`Asignado a` se resuelve mediante personas/aliases MASTER.

La elegibilidad como `VENDEDOR_CIDEF` exige:

```text
persona resuelta
+ tienda CIDEF resuelta
+ rol VENDEDOR_TIENDA vigente
+ intervalo persona_sucursal vigente
+ fecha del evento seleccionada por el consumidor
```

La actividad observada en CRM **no crea un rol de vendedor**.

Un nombre presente en leads no autoriza inferir `VENDEDOR_CIDEF`.

## 8. Origen y suborigen

`Origen` y `Suborigen` son dimensiones observadas de primera clase.

El universo conserva sus valores RAW y normalizados.

No se inventan agrupaciones de campaña/fuente y no se infiere identidad de marca, tienda o vendedor desde `Suborigen`.

Estas dimensiones son especialmente relevantes para preguntas de generación de demanda y deben interpretarse con el reloj temporal apropiado.

## 9. Capabilities públicas actuales

La superficie CRM registrada actualmente contiene:

| Capability | Motor físico | Responsabilidad resumida |
|---|---|---|
| `CONTEXT` | `crm_context_v01` | Contexto descriptivo BIG_PICTURE sobre `crm_universe_v01`, con lectura de demanda o estado comercial según reloj solicitado. |
| `LONGITUDINAL_CONTEXT` | `crm_longitudinal_context_v01` | Evolución temporal determinista de métricas CRM bajo EVENT o COHORT. |

Existe además la superficie transversal:

```text
LONGITUDINAL / CRM
→ crm_longitudinal_context_v01
```

`LONGITUDINAL` es un modo temporal transversal, no un dominio adicional.

La lista ejecutable vigente es `lib/custom-gpt/capabilityRegistry.js`.

## 10. CRM / CONTEXT

`crm_context_v01` consume sólo `crm_universe_v01`.

Su contrato público requiere período y utiliza por defecto:

```text
commercial_universe = OWN_STORES
date_axis = ASSIGNED_AT
```

`COMPANY` debe solicitarse explícitamente.

Los filtros públicos V0.1 son un conjunto cerrado:

```text
brand
product_interest
origin
suborigin
store
```

El filtro SELLER no forma parte del contrato público de `CRM / CONTEXT` V0.1.

Períodos vacíos devuelven un contexto válido no evaluable; no se convierten en evidencia de ausencia comercial.

## 11. Población operacional

Para el contexto operacional, la población base es:

```text
ASSIGNED
```

`AVAILABLE` y `UNASSIGNED` pre-asignación quedan fuera de este contrato.

Sobre la misma población asignada existen dos clasificaciones independientes:

```text
ASSIGNED
├── MANAGEMENT
│   ├── MANAGED
│   └── UNMANAGED
└── RESULT
    ├── SOLD
    ├── NOT_SOLD
    └── UNKNOWN
```

`MANAGED` significa que existe `managed_date`.

`SOLD` no implica `MANAGED`.

Por eso deben cumplirse reconciliaciones independientes:

```text
ASSIGNED = MANAGED + UNMANAGED
ASSIGNED = SOLD + NOT_SOLD + UNKNOWN
```

## 12. Conversión

Una definición importante del runtime es:

```text
CONVERSION_ON_MANAGED
= count(SOLD && MANAGED) / count(MANAGED)
```

No es simplemente:

```text
SOLD / MANAGED
```

porque `RESULT` y `MANAGEMENT` son dimensiones independientes.

La semántica de cualquier otra métrica de conversión debe respetar el contrato específico de la capability y su población/clock.

## 13. Los relojes CRM

CRM posee múltiples timestamps con significados distintos:

```text
CREATED_AT
ASSIGNED_AT
MANAGED_AT
DESISTED_AT
```

No son intercambiables.

### CREATED_AT

Es el reloj de **generación de demanda**.

En `CRM / CONTEXT`, `CREATED_AT` entrega `leads_created` y `demand_mix`; no debe mezclarse silenciosamente con métricas de current-state comercial.

### ASSIGNED_AT

Es el reloj comercial/operacional por defecto.

Selecciona la población que entró al flujo comercial en el período y permite observar su estado actual cuando el contrato lo autoriza.

### MANAGED_AT y DESISTED_AT

Se utilizan en longitudinal para eventos específicos de gestión/desistimiento bajo las restricciones del contrato.

## 14. EVENT vs COHORT

`crm_longitudinal_context_v01` distingue dos modos temporales.

### EVENT

Cuenta eventos según su reloj nativo.

Ejemplos certificados:

```text
LEADS_CREATED
→ EVENT + CREATED_AT

LEADS_ASSIGNED
→ EVENT + ASSIGNED_AT

MANAGED
→ EVENT + MANAGED_AT

DESISTED
→ EVENT + DESISTED_AT
```

El schema rechaza combinaciones EVENT que no tienen una semántica de evento válida.

Por ejemplo, métricas current-state como `SOLD`, `UNMANAGED` o `CONVERSION_ON_MANAGED` no se convierten artificialmente en eventos mediante un timestamp elegido ad hoc.

### COHORT

Selecciona una cohorte por un reloj explícito y evalúa métricas compatibles sobre esa población.

Para operación comercial normalmente se prefiere:

```text
ASSIGNED_AT
```

Para generación de demanda, campañas, origen o suborigen puede corresponder:

```text
CREATED_AT
```

La elección depende de la pregunta, no de conveniencia técnica.

## 15. Current state vs historia

Esta es una frontera crítica de CRM.

`CRM_Cidef_raw` no preserva un historial completo de transiciones de estado.

Por lo tanto, cuando `crm_context_v01` selecciona una población histórica por evento y muestra:

```text
MANAGED / UNMANAGED
SOLD / NOT_SOLD / UNKNOWN
```

está describiendo el **estado actualmente observable de esa población**, no necesariamente el estado que tenía cada lead en aquella fecha histórica.

Ejemplo conceptual:

```text
leads asignados en junio
→ seleccionados por ASSIGNED_AT junio
→ estado SOLD observado hoy
```

no significa:

```text
estado SOLD al cierre histórico de junio
```

Snapshot/as-of histórico no soportado no debe inferirse.

## 16. Grain organizacional

Para análisis `STORE` o `SELLER`, el contrato longitudinal exige:

```text
commercial_universe = OWN_STORES
```

Esto aplica cuando STORE/SELLER aparece como:

- grain;
- breakdown;
- filtro.

No se evalúan vendedores internos sobre COMPANY como sustituto implícito del universo de tiendas propias.

La identidad unresolved/ambiguous debe permanecer explícita y no desaparecer silenciosamente de la cobertura.

## 17. Métricas longitudinales

El contrato CRM longitudinal expone actualmente métricas como:

```text
LEADS_CREATED
LEADS_ASSIGNED
SOLD
NOT_SOLD
MANAGED
UNMANAGED
MANAGEMENT_COVERAGE
CONVERSION_ON_MANAGED
IN_MANAGEMENT
OPPORTUNITY
CLOSED
DESISTED
CONVERSION_RATE
```

Grains soportados incluyen:

```text
TOTAL
BRAND
PRODUCT_INTEREST
ORIGIN
SUBORIGIN
STATUS
STORE
SELLER
INTEREST_LEVEL
DESIST_REASON
```

Cada métrica debe usarse sólo con los clocks y modos permitidos por el contrato público.

## 18. Cobertura y validación

`crm_universe_v01` expone cobertura para aspectos como:

- deduplicación;
- parsing temporal;
- identidad de producto;
- identidad de tienda;
- identidad de vendedor;
- elegibilidad `VENDEDOR_CIDEF`;
- pertenencia a universo comercial;
- disponibilidad de Origin/Suborigin.

Las validaciones reconcilian fuente, leads deduplicados, eventos analíticos, estados de identidad y membership `OWN_STORES`, evitando multiplicación accidental por joins MASTER.

El contexto operacional agrega reconciliaciones de MANAGEMENT y RESULT.

`UNRESOLVED`, `AMBIGUOUS` y `NOT_APPLICABLE` son estados informativos; no deben convertirse silenciosamente en identidad resuelta.

## 19. Relación con VENTAS

CRM y VENTAS responden preguntas distintas:

```text
CRM    → demanda, gestión y conversión observable
VENTAS → resultado VIN reconocido
```

Una relación entre ambos puede ser analíticamente útil, pero no autoriza causalidad automática.

Ejemplos:

```text
leads ↑ + VIN ↑
≠ prueba de causalidad

conversión CRM ↓
≠ explicación suficiente de VIN ↓
```

La integración ocurre en el agente después de recibir evidencia determinista compatible, salvo una capability explícitamente diseñada para combinar fuentes.

## 20. Relación con RVM

CRM no mide mercado ni market share.

RVM puede aportar contexto de mercado para interpretar demanda o desempeño, pero las poblaciones, clocks y métricas deben permanecer separadas.

```text
mercado ↑ + leads ↑
```

puede constituir evidencia contextual, pero no demuestra por sí sola capturabilidad, oportunidad o causa.

## 21. Qué CRM no permite afirmar por sí solo

CRM no permite concluir automáticamente:

```text
leads ↑       = oportunidad capturable
leads ↓       = deterioro comercial
unmanaged ↑   = mala gestión causal
conversion ↓  = causa de caída VIN
SOLD CRM      = VIN reconocido por VENTAS
origen ↑      = campaña efectiva
```

Estas conclusiones requieren semántica adicional y, cuando corresponda, evidencia compatible de VENTAS, RVM u otras referencias.

## 22. NO RECONSTRUCTION

Los consumidores CRM migrados deben operar así:

```text
crm_universe_v01
→ capability determinista
→ resultado
```

No así:

```text
CRM RAW
→ deduplicación local
→ normalización local
→ joins MASTER locales
→ inferencia de tienda/vendedor/producto
→ cálculo
```

`crm_longitudinal_context_v01` ya consume `crm_universe_v01.analytical_events` sin reconstrucción local de RAW/MASTER.

## 23. Qué no pertenece a este documento

Este documento no describe:

- importación de CRM;
- loaders;
- refresh de fuentes;
- construcción de MASTER;
- workflows externos de proyección semanal;
- reconstrucción histórica no soportada;
- diseños futuros no implementados.

Para efectos de esta documentación, las autoridades consumidas por el runtime se consideran entradas disponibles.

## 24. Autoridades relacionadas

```text
lib/custom-gpt/capabilityRegistry.js
  → mapping público CRM capability → motor

rom/schema.json
  → contratos públicos CRM

rom/business-rules.md
  → reglas de negocio y comparabilidad

rom/business-semantics.md
  → nivel de conclusión permitido por la evidencia

rom/orchestrator.md
  → selección y coordinación de capabilities

docs/architecture/CRM_ANALYTICAL_UNIVERSE_V0.1.md
  → contrato documental detallado de crm_universe_v01

docs/agent/README.md
  → arquitectura general del agente
```

## 25. Resumen de invariantes CRM

1. El grain del universo es un lead CRM deduplicado.
2. `OWN_STORES` es el universo comercial normal; `COMPANY` es explícito; DEALERS no está certificado.
3. `Empresa` RAW no define commercial universe.
4. `Producto de interes` alimenta identidad canónica; `Marca` RAW no es autoridad canónica.
5. Actividad CRM no crea rol `VENDEDOR_CIDEF`.
6. `Origen` y `Suborigen` son dimensiones observadas y no autorizan inferencias de identidad.
7. `ASSIGNED` es la población base del contexto operacional.
8. MANAGEMENT y RESULT son clasificaciones independientes.
9. `SOLD` no implica `MANAGED`.
10. `CONVERSION_ON_MANAGED = SOLD && MANAGED / MANAGED`.
11. CREATED_AT y ASSIGNED_AT responden preguntas distintas: demanda vs operación comercial.
12. EVENT y COHORT no son intercambiables.
13. Estado actual de una cohorte histórica no equivale a snapshot histórico.
14. STORE/SELLER requieren OWN_STORES en longitudinal.
15. CRM no reconstruye estado histórico que la fuente no preserva.
16. Los consumidores migrados calculan sobre `crm_universe_v01` y no reconstruyen RAW/MASTER.
17. Una métrica CRM no autoriza por sí sola una conclusión causal o semántica fuerte.
