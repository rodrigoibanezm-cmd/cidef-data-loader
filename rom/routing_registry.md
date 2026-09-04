# Domain capability registry — CIDEF Agent

Estado: `IMPLEMENTED`

Autoridad de código:

```text
lib/custom-gpt/capabilityRegistry.js
```

Integración:

```text
lib/custom-gpt-router.js
```

La capa implementada resuelve:

```text
domain + capability -> action física existente
```

sin modificar motores ni eliminar el execution path vigente por `action`.

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

## Reglas implementadas

1. El registry es explícito y cerrado.
2. Un dominio sólo puede resolver capabilities registradas dentro de ese dominio.
3. Un dominio desconocido falla con `INVALID_CAPABILITY_DOMAIN`.
4. Una capability inexistente o perteneciente a otro dominio falla con `UNSUPPORTED_CAPABILITY_FOR_DOMAIN`.
5. `runCustomGptCapability()` resuelve la capability y delega al executor físico existente.
6. El input debe seguir siendo un objeto; input inválido falla antes de ejecutar un motor.
7. Las 46 actions físicas continúan registradas en `ACTIONS` para compatibilidad interna y transición.
8. `INTERNAL_SUPPORT` y `OUT_OF_CURRENT_SCOPE` no forman parte de `DOMAIN_CAPABILITY_REGISTRY`.
9. No se modificó `rom/schema.json` todavía.
10. No se crearon endpoints públicos todavía.

## Superficie registrada

### SALES

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
COMPETITIVE_CONTEXT
SHARE_TRAJECTORY
COMPETITIVE_RELATION
INVERSE_SHARE_MOVEMENT
MARKET_HISTORY
```

### DISCOVERY

```text
LIST_TABLES
TABLE_SCHEMA
PROFILE_TABLE
QUERY_TABLE
```

### LONGITUDINAL

```text
VENTAS
RVM
CRM
```

## Compatibilidad

El path vigente continúa funcionando:

```text
runCustomGptAction(action, input)
```

La nueva capa agrega en paralelo:

```text
runCustomGptCapability({ domain, capability, input })
```

Por lo tanto esta fase no corta todavía el acceso público histórico. El corte se hará recién cuando existan y estén testeadas las cuatro fachadas de dominio y el OpenAPI se migre a ellas.

## Tests agregados

```text
test/custom-gpt-capability-routing.test.js
```

Cubre:

- cuatro dominios exactos;
- 25 capabilities exactas;
- todas las capabilities apuntan a actions físicas existentes;
- routing correcto `SALES/STORE_CHANGE_CONTRIBUTION`;
- rechazo cross-domain;
- rechazo de dominio desconocido;
- ausencia de actions internas/out-of-scope en la superficie pública;
- delegación al executor físico;
- rechazo de input inválido antes de ejecutar motor.

## Siguiente fase

Crear cuatro fachadas públicas delgadas, todas sobre el mismo router:

```text
POST /api/custom-gpt/sales
POST /api/custom-gpt/market
POST /api/custom-gpt/discovery
POST /api/custom-gpt/longitudinal
```

Cada fachada fijará su `domain` y aceptará sólo:

```text
capability
input
```

Todavía no corresponde retirar `/api/custom-gpt` ni modificar la superficie OpenAPI hasta validar esas cuatro fachadas.
