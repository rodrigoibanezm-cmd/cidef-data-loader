# VIN Semantic Cube V0.1

## Grain
Fact canónico: `vehicle_vin` sobre `inventario_vehiculos_global_raw.vin_chasis`. Un VIN elegible, no vacío y único equivale a una unidad. Duplicados son `VIN_GRAIN_VIOLATION`.

## Medida pública
`unit_count = 1`, agregación `SUM`.

## Dimensiones y mappings físicos validados
El registry versionado es la única fuente de verdad. Mappings principales: `brand→marca`, `model→modelo` con fallback `desc_abrev`, `version_description→desc_abrev`, `model_year→ano`, `manufacturing_year→ano_fabricacion`, `vehicle_type→tipo_ficha`, `motorization_type→tipo_motor`, `emission_standard→norma`, `seller→vendedor`, `sales_branch→sucursal_venta`, `dealer_sale→dealer_venta`, `warehouse→bodega`, `stage→etapa`, `is_current→vigente`, `is_reserved→esta_reservado`, `is_in_transit→esta_en_transito`, `is_in_yard→en_patio`, `pending_delivery→pendiente_entrega`, `shipment_cancelled→embarque_anulado`, `shipment_pending→embarque_pendiente`, `is_dealer→es_dealer`.

`dealer_sale.canonical` usa `dealers_master`. `dealer_supervisor` no existe físicamente en inventario: se deriva como `dealer_venta → dealers_master → supervisor` y representa supervisor ACTUAL. Una lectura histórica sin `options.identity_semantics="current"` falla con `HISTORICAL_IDENTITY_NOT_AVAILABLE`.

## Roles temporales
`STOCK_ENTRY→fecha_ingreso_stk`, `NV→fecha_nv`, `INVOICE→fecha_factura`, `RECEIPT→fecha_recibo`, `PLANNED_DELIVERY→fecha_entrega_planificada`, `ETA→fecha_eta`, `FAC_NC_DOCUMENT→fecha_fac_nc`. No existe fecha default ni AUTO.

## Universos
- `ALL_VIN`: VIN elegibles.
- `DEALER_STOCK`: `es_dealer=true AND vigente='1' AND dealer_venta informado`.
- `EVENT_POPULATION`: VIN elegibles con evento temporal registrado y parseable.

## Snapshot guard
`stage`, `warehouse`, vigente/reserva/tránsito/patio/pendiente entrega y shipment flags son snapshot actual. No se reconstruyen históricamente. Pueden cruzarse con eventos históricos solo declarando `options.snapshot_semantics="current"`.

## Derived metric
`aging_days`, exclusivamente desde `STOCK_ENTRY`, con `AVG|MIN|MAX` y `as_of_date` explícita. Filtros sobre derived metrics no están disponibles en V0.1 y se rechazan determinísticamente.

## Estado V0.1
No expone descuento, margen, costo, gastos, ranking, forecasting, tendencias, scoring ni causalidad.
