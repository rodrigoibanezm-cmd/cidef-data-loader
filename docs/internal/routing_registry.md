# Domain capability registry — CIDEF Agent

Estado: `SCHEMA_MIGRATED`

Autoridad de código:

```text
lib/custom-gpt/capabilityRegistry.js
lib/custom-gpt-router.js
lib/custom-gpt/domainEndpoint.js
```

Autoridad pública para el LLM:

```text
rom/schema.json
```

La capa implementada resuelve:

```text
domain + capability -> action física existente
```

y expone cinco fachadas públicas delgadas sobre el mismo router central.

## Arquitectura implementada

```text
Custom GPT
│
├─ POST /api/custom-gpt/sales
├─ POST /api/custom-gpt/market
├─ POST /api/custom-gpt/crm
├─ POST /api/custom-gpt/discovery
└─ POST /api/custom-gpt/longitudinal
          │
          ▼
 lib/custom-gpt/domainEndpoint.js
          │
          ▼
  lib/custom-gpt-router.js
          │
          ▼
 DOMAIN_CAPABILITY_REGISTRY
          │
          ▼
 action física existente
```

Los endpoints NO son routers independientes. Cada archivo de API fija un dominio y delega al mismo handler y al mismo router central.

## Dominios públicos registrados

```text
SALES        15 capabilities
MARKET        5 capabilities
CRM           2 capabilities
DISCOVERY     4 capabilities
LONGITUDINAL  3 capabilities
TOTAL        29 capabilities
```

El inventario histórico de actions físicas y su clasificación permanece documentado en:

```text
rom/routing_inventory.md
```

## Contrato de las fachadas

Cada endpoint acepta únicamente:

```json
{
  "capability": "...",
  "input": {}
}
```

No acepta `action` física ni otros campos top-level. Un campo no soportado falla con:

```text
UNSUPPORTED_DOMAIN_REQUEST_FIELD
```

La capability se normaliza a uppercase y el dominio viene fijado por el endpoint.

## OpenAPI público

`rom/schema.json` ya no expone:

```text
POST /api/custom-gpt
action: <nombre físico>
```

El schema público expone únicamente cinco `operationId`:

```text
cidefSales
cidefMarket
cidefCrm
cidefDiscovery
cidefLongitudinal
```

con sus enums de capabilities por dominio.

La versión vigente del schema es:

```text
1.56.0
```

Las actions físicas siguen existiendo internamente para compatibilidad, tests y workflows técnicos, pero dejaron de formar parte del contrato visible del LLM.

## Reglas implementadas

1. El registry es explícito y cerrado.
2. Un dominio sólo puede resolver capabilities registradas dentro de ese dominio.
3. Un dominio desconocido falla con `INVALID_CAPABILITY_DOMAIN`.
4. Una capability inexistente o perteneciente a otro dominio falla con `UNSUPPORTED_CAPABILITY_FOR_DOMAIN`.
5. `runCustomGptCapability()` resuelve la capability y delega al executor físico existente.
6. El input debe ser un objeto; input inválido falla con `INVALID_CAPABILITY_INPUT`.
7. Los endpoints sólo aceptan `POST`.
8. Los endpoints sólo aceptan `capability` e `input` en el body.
9. Las actions físicas continúan registradas en `ACTIONS` para compatibilidad interna y transición.
10. `INTERNAL_SUPPORT` y `OUT_OF_CURRENT_SCOPE` no forman parte de `DOMAIN_CAPABILITY_REGISTRY`.
11. `/api/custom-gpt` histórico sigue existiendo internamente.
12. `rom/schema.json` expone sólo las cinco fachadas públicas.
13. El schema no publica nombres físicos de motores.
14. LONGITUDINAL V0.2 mantiene sus métricas, grains, filtros y semántica temporal; la reorganización sólo cambia la superficie de routing.

## Endpoints implementados

### SALES

```text
POST /api/custom-gpt/sales
```

Capabilities:

```text
MONTHLY_ACTUAL
DAILY_CLOSE_FORECAST
CURRENT_MONTH_CLOSE_FORECAST
PREDICTABILITY_DAY
INTRAMONTH_HISTORY
PRODUCT_SALES
PRODUCT_DETAIL
PRODUCT_CONCENTRATION
PRODUCT_CHANGE_CONTRIBUTION
STORE_CHANGE_CONTRIBUTION
SELLER_CHANGE_CONTRIBUTION
RELATIVE_PERFORMANCE
DETERIORATION_STATUS
```

### MARKET

```text
POST /api/custom-gpt/market
```

Capabilities:

```text
COMPETITIVE_CONTEXT
SHARE_TRAJECTORY
COMPETITIVE_RELATION
INVERSE_SHARE_MOVEMENT
MARKET_HISTORY
```

`SHARE_TRAJECTORY` acepta dos contratos compatibles: el legado model-scoped con
`target_model_ids`, y marca canónica con `entity={brand|brand_id}` más
`organization_scope` explícito. La ruta de marca resuelve MASTER y consume
`rvm_universe_v01` en backend; el agente no expande marca a modelos.

### CRM

```text
POST /api/custom-gpt/crm
```

Capabilities:

```text
CONTEXT
LONGITUDINAL_CONTEXT
```

`CONTEXT` resuelve el BIG_PICTURE descriptivo mediante `crm_context_v01`; `LONGITUDINAL_CONTEXT` conserva el análisis temporal CRM. Ambos pertenecen al dominio CRM.

### DISCOVERY

```text
POST /api/custom-gpt/discovery
```

Capabilities:

```text
LIST_TABLES
TABLE_SCHEMA
PROFILE_TABLE
QUERY_TABLE
```

### LONGITUDINAL

```text
POST /api/custom-gpt/longitudinal
```

Capabilities:

```text
VENTAS
RVM
CRM
```

## Compatibilidad

El execution path vigente continúa disponible internamente:

```text
runCustomGptAction(action, input)
```

La capa semántica pública usa:

```text
runCustomGptCapability({ domain, capability, input })
```

Y las cinco fachadas sólo llaman a esta segunda capa.

El endpoint legacy `/api/custom-gpt` no fue eliminado del backend; simplemente dejó de estar publicado en `rom/schema.json`.

## Tests existentes para la nueva capa

```text
test/custom-gpt-capability-routing.test.js
test/custom-gpt-domain-endpoints.test.js
```

Cubren:

- cinco superficies públicas exactas;
- 29 capabilities exactas;
- mapping a actions físicas existentes;
- rechazo cross-domain;
- rechazo de dominio desconocido;
- ausencia de actions internas/out-of-scope en el registry público;
- delegación al executor físico;
- rechazo de input inválido;
- POST obligatorio;
- capability obligatoria;
- rechazo explícito del campo físico `action`;
- contrato común de las cinco fachadas.

## Estado de transición

```text
REGISTRY                  IMPLEMENTED
CENTRAL CAPABILITY ROUTER IMPLEMENTED
SALES ENDPOINT            IMPLEMENTED
MARKET ENDPOINT           IMPLEMENTED
CRM ENDPOINT              IMPLEMENTED
DISCOVERY ENDPOINT        IMPLEMENTED
LONGITUDINAL ENDPOINT     IMPLEMENTED
LEGACY /api/custom-gpt    PRESERVED INTERNALLY
OPENAPI / schema          MIGRATED — 1.56.0
```

## Siguiente fase

Validar el schema contra el importador de Custom GPT y ejecutar pruebas funcionales de las cinco operaciones públicas. Una vez validado el contrato real, se puede decidir si el endpoint legacy se mantiene indefinidamente como superficie técnica o se retira en una fase posterior.
