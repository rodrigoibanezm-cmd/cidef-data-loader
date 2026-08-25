# VIN Semantic Cube V0.1

## Grain
Fact canónico: `vehicle_vin` sobre `inventario_vehiculos_global_raw.vin_chasis`. Un VIN elegible, no vacío y único equivale a una unidad. Duplicados son `VIN_GRAIN_VIOLATION`.

## Medida pública
`unit_count = 1`, agregación `SUM`.

## Dimensiones
Registro semántico versionado en `lib/olap/vin-cube-registry.js`. Incluye brand, model, version_description, años, tipo/motorización/norma, seller, sales_branch, dealer_sale, dealer_supervisor, warehouse, stage y flags operativos. Identidades soportan niveles raw/normalized cuando están validados. `dealer_sale.canonical` usa `dealers_master`.

## Roles temporales
`STOCK_ENTRY`, `NV`, `INVOICE`, `RECEIPT`, `PLANNED_DELIVERY`, `ETA`, `FAC_NC_DOCUMENT`. No existe fecha default ni AUTO. El parser reconoce el formato operacional `MM/DD/YY HH:MI` y fechas ISO; inválidos se auditan.

## Universos
- `ALL_VIN`: VIN elegibles.
- `DEALER_STOCK`: `es_dealer=true AND vigente='1' AND dealer_venta informado`.
- `EVENT_POPULATION`: VIN elegibles con evento temporal registrado y parseable.

## Snapshot guard
`stage`, `warehouse`, vigente/reserva/tránsito/patio/pendiente entrega y shipment flags son snapshot actual. No se reconstruyen históricamente. Pueden cruzarse con eventos históricos solo declarando `options.snapshot_semantics="current"`.

## Derived metric
`aging_days`, exclusivamente desde `STOCK_ENTRY`, con `AVG|MIN|MAX` y `as_of_date` explícita.

## Estado V0.1
No expone descuento, margen, costo, gastos, ranking, forecasting, tendencias, scoring ni causalidad.
