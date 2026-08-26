# VIN OLAP Engine V0.1

## Responsabilidad
`vin_olap` ejecuta consultas semánticas deterministas sobre `VIN_SEMANTIC_CUBE_V0.1` sin aceptar SQL ni columnas físicas del caller.

## Arquitectura
- `vin-cube-registry.js`: contrato semántico y mappings físicos validados.
- `vin-normalizers.js`: normalización VIN/texto y compatibilidad de imports temporales.
- `vin-auditors.js`: grain y reconciliaciones.
- `semantics/`: dimensiones, filtros, universos y tiempo compartidos por ambos engines.
- `validation/`: validación estructural, operación y guards semánticos.
- `query/`: utilidades y planes SQL independientes para aggregate y temporal boundary.
- `operations/pure/`: ejecución sobre arrays para tests unitarios.
- `operations/sql/`: ejecución productiva en Postgres.
- `output/`: coverage, auditoría, lineage y envelopes compartidos.
- `vin-query-builder.js`, `vin-engine.js` y `vin-olap.js`: entrypoints que validan y despachan.

Producción no carga la tabla completa en Node. Elegibilidad, universo, filtros, tiempo, grouping, `COUNT(*)`, aging, totals y paginación se empujan a Postgres. Auditorías usan queries auxiliares pequeñas.

### Regla de mantenibilidad

Las nuevas operaciones o capacidades de `vin_olap` deben implementarse como módulos/helpers propios. Los entrypoints y módulos core no deben incorporar la implementación completa de nuevas features. Los archivos de lógica deben mantenerse idealmente en el rango de 100–120 líneas.

## Filters
Formato público:
```json
{"field":{"type":"dimension","name":"brand","level":"normalized"},"op":"in","value":["FOTON","DFM"]}
```
`field` string y nombres físicos se rechazan. `field.type="derived_metric"` para `aging_days` se rechaza en V0.1 con `METRIC_NOT_AVAILABLE`.

Operadores V0.1:
- categorical/identity: `eq`, `neq`, `in`, `not_in`, `is_null`, `not_null`;
- numeric: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `between`, `is_null`, `not_null`;
- boolean: `eq`, `is_null`, `not_null`.

Un operador incompatible con el tipo semántico falla con `INVALID_QUERY` antes de construir/ejecutar SQL.

## Tiempo
Toda consulta temporal declara `time.role`. `grain=null` filtra por fecha sin agregar dimensión temporal. Los roles físicos están declarados únicamente en el registry.

## Identidad dealer
`dealer_sale.canonical` hace join a `dealers_master` y distingue:
- raw dealer vacío/null → `__MISSING__`;
- raw dealer informado sin match canónico → `__UNMATCHED__`;
- match canónico → `dealer_id`.

`dealer_supervisor` se deriva desde el dealer canónico y corresponde al supervisor actual. Consultas con tiempo histórico requieren `options.identity_semantics="current"`; de lo contrario `HISTORICAL_IDENTITY_NOT_AVAILABLE`.

## Universe reconciliation
La reconciliación obligatoria conserva todos los niveles:

```text
source = eligible + excluded_ineligible
eligible = universe + excluded_by_universe
universe = filtered + excluded_by_filter
filtered = used + excluded_invalid_required
```

Cualquier ecuación inconsistente produce `UNIVERSE_RECONCILIATION_FAILURE` y `result:null`.

## Auditoría
Se calculan independientemente de la página: source rows, VIN elegibles, duplicados, universe, filtered, used, exclusiones, parse temporal, totals y aggregation reconciliation. Un `FAIL` nunca devuelve filas analíticas.

## Limit/offset
Solo afectan `result.rows`. `totals`, coverage y reconciliaciones siempre usan el universo completo. `has_more` usa el número total de grupos.

## Exposición
`vin_olap` está registrado y expuesto a `dealer_analytics` por la Action única `/api/router`, junto con `table_schema`, `profile_table`, `query_table` y `join_tables`.
