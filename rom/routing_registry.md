# Domain capability registry — CIDEF Agent

Estado: `ENDPOINTS_IMPLEMENTED`

Autoridad de código:

```text
lib/custom-gpt/capabilityRegistry.js
lib/custom-gpt-router.js
lib/custom-gpt/domainEndpoint.js
```

La capa implementada resuelve:

```text
domain + capability -> action física existente
```

y ahora expone cuatro fachadas públicas delgadas sobre el mismo router central.

## Arquitectura implementada

```text
Custom GPT
│
├─ POST /api/custom-gpt/sales
├─ POST /api/custom-gpt/market
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
SALES        13 capabilities
MARKET        5 capabilities
DISCOVERY     4 capabilities
LONGITUDINAL  3 capabilities
TOTAL        25 capabilities
```

El inventario de las 46 actions físicas y su clasificación permanece documentado en:

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

## Reglas implementadas

1. El registry es explícito y cerrado.
2. Un dominio sólo puede resolver capabilities registradas dentro de ese dominio.
3. Un dominio desconocido falla con `INVALID_CAPABILITY_DOMAIN`.
4. Una capability inexistente o perteneciente a otro dominio falla con `UNSUPPORTED_CAPABILITY_FOR_DOMAIN`.
5. `runCustomGptCapability()` resuelve la capability y delega al executor físico existente.
6. El input debe ser un objeto; input inválido falla con `INVALID_CAPABILITY_INPUT`.
7. Los endpoints sólo aceptan `POST`.
8. Los endpoints sólo aceptan `capability` e `input` en el body.
9. Las 46 actions físicas continúan registradas en `ACTIONS` para compatibilidad interna y transición.
10. `INTERNAL_SUPPORT` y `OUT_OF_CURRENT_SCOPE` no forman parte de `DOMAIN_CAPABILITY_REGISTRY`.
11. `/api/custom-gpt` histórico sigue existiendo y no fue modificado en esta fase.
12. `rom/schema.json` todavía no fue migrado a las cuatro nuevas operaciones.

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

El execution path vigente continúa disponible:

```text
runCustomGptAction(action, input)
```

La capa semántica funciona en paralelo:

```text
runCustomGptCapability({ domain, capability, input })
```

Y las cuatro fachadas sólo llaman a esta segunda capa.

Por lo tanto aún no se ha cortado el acceso histórico de `/api/custom-gpt`. El corte de libertad del LLM ocurre cuando `rom/schema.json` deje de exponer el endpoint/action físico y exponga únicamente estas cuatro operaciones.

## Tests agregados

```text
test/custom-gpt-capability-routing.test.js
test/custom-gpt-domain-endpoints.test.js
```

La cobertura nueva valida:

- cuatro dominios exactos;
- 25 capabilities exactas;
- mapping a actions físicas existentes;
- rechazo cross-domain;
- rechazo de dominio desconocido;
- ausencia de actions internas/out-of-scope en el registry público;
- delegación al executor físico;
- rechazo de input inválido;
- POST obligatorio;
- capability obligatoria;
- rechazo explícito del campo físico `action`;
- contrato común de las cuatro fachadas.

## Estado de transición

```text
REGISTRY                 IMPLEMENTED
CENTRAL CAPABILITY ROUTER IMPLEMENTED
SALES ENDPOINT            IMPLEMENTED
MARKET ENDPOINT           IMPLEMENTED
DISCOVERY ENDPOINT        IMPLEMENTED
LONGITUDINAL ENDPOINT     IMPLEMENTED
LEGACY /api/custom-gpt    PRESERVED
OPENAPI / schema          NOT MIGRATED YET
```

## Siguiente fase

Migrar `rom/schema.json` para que el Custom GPT vea únicamente las cuatro fachadas públicas y sus capabilities de dominio.

En esa fase debe desaparecer del contrato visible del LLM la selección libre por:

```text
action: <nombre físico del motor>
```

sin eliminar todavía el endpoint legacy ni las actions físicas internas.
