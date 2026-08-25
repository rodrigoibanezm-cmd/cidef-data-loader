# VIN OLAP Engine V0.1

## Responsabilidad
`vin_olap` ejecuta consultas semánticas deterministas sobre `VIN_SEMANTIC_CUBE_V0.1` sin aceptar SQL ni columnas físicas del caller.

## Arquitectura
- `vin-cube-registry.js`: contrato semántico y mappings físicos validados.
- `vin-normalizers.js`: normalización VIN/texto/fechas.
- `vin-auditors.js`: grain y reconciliaciones.
- `vin-query-builder.js`: validación compartida y SQL determinista construido exclusivamente desde registry/enums internos.
- `vin-engine.js`: engine puro sobre arrays para tests unitarios.
- `vin-olap.js`: ejecución productiva en Postgres.

Producción no carga la tabla completa en Node. Elegibilidad, universo, filtros, tiempo, grouping, `COUNT(*)`, aging, totals y paginación se empujan a Postgres. Auditorías usan queries auxiliares pequeñas.

## Filters
Formato público:
```json
{"field":{"type":"dimension","name":"brand","level":"normalized"},"op":"in","value":["FOTON","DFM"]}
```
`field` string y nombres físicos se rechazan. `field.type="derived_metric"` para `aging_days` se rechaza en V0.1 con `METRIC_NOT_AVAILABLE`.

## Tiempo
Toda consulta temporal declara `time.role`. `grain=null` filtra por fecha sin agregar dimensión temporal. Los roles físicos están declarados únicamente en el registry.

## Identidad dealer
`dealer_sale.canonical` hace join a `dealers_master`. `dealer_supervisor` se deriva desde el dealer canónico y corresponde al supervisor actual. Consultas con tiempo histórico requieren `options.identity_semantics="current"`; de lo contrario `HISTORICAL_IDENTITY_NOT_AVAILABLE`.

## Auditoría
Se calculan independientemente de la página: source rows, VIN elegibles, duplicados, universo, filtered/used, parse temporal, totals y aggregation reconciliation. Un `FAIL` nunca devuelve filas analíticas.

## Limit/offset
Solo afectan `result.rows`. `totals`, coverage y reconciliaciones siempre usan el universo completo. `has_more` usa el número total de grupos.

## Exposición
`vin_olap` permanece registrado internamente, pero `api/router.js` mantiene `dealer_analytics` únicamente con `table_schema`, `profile_table`, `query_table`, `join_tables`. `rom/schema.json` no expone `vin_olap`.
