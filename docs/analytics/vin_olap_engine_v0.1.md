# VIN OLAP Engine V0.1

## Responsabilidad
`vin_olap` ejecuta consultas semánticas deterministas sobre `VIN_SEMANTIC_CUBE_V0.1`:

`validate → registry → normalize → universe → filter → aggregate → derive → reconcile → audit → JSON`.

No interpreta lenguaje natural y no acepta columnas físicas, SQL, regex ni fórmulas.

## Implementación
- `lib/olap/vin-cube-registry.js`: contrato semántico versionado.
- `lib/olap/vin-normalizers.js`: VIN/texto/fechas/duración.
- `lib/olap/vin-auditors.js`: grain y reconciliaciones.
- `lib/olap/vin-query-builder.js`: lectura física fija sin SQL del caller.
- `lib/olap/vin-engine.js`: validación y ejecución pura sobre filas.
- `lib/olap/vin-olap.js`: adaptador Neon.
- `lib/motors/vin-olap.js`: wrapper de registro.

## Contrato
Entrada: cube, universe, measures, derived_metrics, dimensions, time, filters y options. Máximo 3 dimensiones no temporales más una temporal opcional. `time.grain=null` filtra sin agrupar.

## Auditoría
Incluye VIN Universe, Temporal Parse, Time Role, Dealer Stock, Universe Reconciliation y Aggregation Reconciliation. Un FAIL devuelve `result:null`; WARNING puede devolver datos.

## Paginación
`limit` y `offset` se aplican después de agregar. Totals, coverage y reconciliaciones usan todos los grupos.

## Lineage
Devuelve fuente física, fact, versión del cubo, universo, time role, normalizaciones e identity masters usados. Nunca devuelve SQL.

## Exposición
El motor está registrado internamente en `lib/motors/index.js`, pero no se agrega a `dealer_analytics` ni al OpenAPI del Custom GPT en V0.1.

## Ejemplo
```json
{
  "cube":"VIN_SEMANTIC_CUBE_V0.1",
  "universe":{"type":"ALL_VIN"},
  "measures":[{"name":"unit_count","aggregation":"SUM","as":"units"}],
  "derived_metrics":[],
  "dimensions":[{"name":"seller","level":"normalized"}],
  "time":{"role":"NV","grain":null,"from":"2026-01-01","to":"2026-07-31"},
  "filters":[],
  "options":{"include_totals":true,"include_coverage":true,"include_lineage":true,"limit":300,"offset":0}
}
```
