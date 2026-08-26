# Cubo VIN

## Cube

`VIN_SEMANTIC_CUBE_V0.1` tiene grano `VIN / vin_chasis`: un VIN elegible equivale a `1 unit_count`. Un VIN nulo o vacío no es elegible; VIN duplicados provocan `FAIL`.

## Universes

- `ALL_VIN`: todos los VIN elegibles de la fuente.
- `DEALER_STOCK`: VIN elegibles con `es_dealer=true`, `vigente='1'` y `dealer_venta` informado.
- `EVENT_POPULATION`: VIN elegibles con una fecha válida en el `event` indicado; `event` debe ser un time role.

## Dimensions

| Dimensión | Niveles soportados |
|---|---|
| `brand` | `raw`, `normalized` |
| `model` | `raw`, `normalized` |
| `version_description` | `raw`, `normalized` |
| `model_year` | sin nivel |
| `manufacturing_year` | sin nivel |
| `vehicle_type` | `raw`, `normalized` |
| `motorization_type` | `raw`, `normalized` |
| `emission_standard` | `raw`, `normalized` |
| `seller` | `raw`, `normalized` |
| `sales_branch` | `raw`, `normalized` |
| `dealer_sale` | `raw`, `normalized`, `canonical` |
| `dealer_supervisor` | `raw`, `normalized` |
| `warehouse` | `raw`, `normalized` |
| `stage` | `raw`, `normalized` |
| `is_current` | sin nivel |
| `is_reserved` | sin nivel |
| `is_in_transit` | sin nivel |
| `is_in_yard` | sin nivel |
| `pending_delivery` | sin nivel |
| `shipment_cancelled` | sin nivel |
| `shipment_pending` | sin nivel |
| `is_dealer` | sin nivel |

`normalized` aplica `TRIM`, normalización de espacios y mayúsculas. `canonical` solo está disponible donde se indica.

## Time roles

- `STOCK_ENTRY`
- `NV`
- `INVOICE`
- `RECEIPT`
- `PLANNED_DELIVERY`
- `ETA`
- `FAC_NC_DOCUMENT`

No existe fecha default. Si hay bloque `time`, `time.role` es obligatorio. Los grains válidos son `day`, `month`, `quarter`, `year` o `null` para filtrar sin agrupar temporalmente.

## TEMPORAL_BOUNDARY

Descubre un extremo temporal sin solicitar una serie. `boundary=MIN|MAX` devuelve el primer o último período válido para un `time.role` explícito y grain `day|month|quarter|year`. Admite los universos y filtros semánticos del cubo; no acepta grain `null`, columnas físicas ni SQL.

Ejemplo: `EVENT_POPULATION NV + time.role=NV + grain=month + boundary=MAX` devuelve el último mes con NV válida. Si se usa `EVENT_POPULATION`, `universe.event` debe coincidir con `time.role`.

> Cuando una consulta dependa de un extremo temporal desconocido, usar `TEMPORAL_BOUNDARY` antes de solicitar la serie principal.

## Measures

`unit_count` soporta únicamente `SUM`.

## Derived metric

`aging_days` se calcula desde `STOCK_ENTRY` hasta `as_of_date` y soporta `AVG`, `MIN` y `MAX`.

## Historical vs snapshot

Los eventos históricos pueden analizarse temporalmente. Los flags y estados actuales —por ejemplo bodega, etapa, vigencia, reserva, tránsito, patio, entrega o embarque— no reconstruyen estados históricos. Cruzar un snapshot actual con un evento histórico exige `options.snapshot_semantics="current"`.

`dealer_supervisor` es identidad actual derivada de `dealers_master`; con período histórico exige `options.identity_semantics="current"`.

## Dealer identity

En `dealer_sale.canonical`:

- `dealer_id`: match canónico en `dealers_master`;
- `__MISSING__`: el dealer fuente no está informado;
- `__UNMATCHED__`: hay valor fuente, pero no existe match canónico.

`dealer_supervisor` representa la identidad actual asociada por `dealers_master`.

## Audit

Revisar siempre `status`, `audit`, `coverage` y `warnings`. Si `status=FAIL`, no interpretar el resultado.

La cobertura debe reconciliar:

```text
source = eligible + excluded_ineligible
eligible = universe + excluded_by_universe
universe = filtered + excluded_by_filter
filtered = used + excluded_invalid_required
```

## Límites

No soporta SQL libre, columnas físicas, discount/margin/cost no expuestos, forecasting, causalidad, reconstrucción histórica de snapshots ni filtros sobre derived metrics en V0.1.
