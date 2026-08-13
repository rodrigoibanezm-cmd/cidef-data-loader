# monthly_seasonality_analysis

## Responsabilidad
Mide estacionalidad mensual histórica sobre matriculaciones RVM. MARKET y CIDEF
son scopes separados; la fecha siempre es `rvm_raw.fecha`.

## Input
```json
{
  "scope": "MARKET | CIDEF",
  "group_by": "TOTAL | MARCA | MODELO | SUCURSAL | VENDEDOR",
  "brand": null,
  "model": null,
  "branch": null,
  "seller": null,
  "date_from": "YYYY-MM | null",
  "date_to": "YYYY-MM | null",
  "page": 1,
  "page_size": 50
}
```

`scope` es obligatorio; `group_by` usa `TOTAL` por defecto. MARKET admite solo
TOTAL, MARCA y MODELO, y rechaza filtros de sucursal/vendedor. `page_size` máximo
es 100 y pagina valores de grupo completos; TOTAL devuelve toda su serie y
`pagination: null`. Sin fechas se usa todo el histórico filtrado disponible.

## Output
- `periodo`: primer y último mes con datos después de filtros.
- `coverage`: `null` en MARKET; en CIDEF incluye `rvm_cidef`, `matched`,
  `unmatched`, `match_pct` como números.
- `pagination`: metadatos por valores de grupo.
- `summary_by_month_number`: grupo, mes, nombre, promedios, años observados y
  `historical_trend_pct` (cambio desde la observación más antigua a la más nueva).
- `series`: año-mes, grupo, unidades, pesos anual/trimestral, desviación contra
  el promedio histórico del mismo mes y ranking dentro del año.

Pesos y desviaciones se redondean a 4 decimales. Los pesos usan solo meses
observados dentro del rango solicitado; no se completan meses faltantes.

## JOIN CIDEF
Se normaliza con `UPPER(TRIM())` y se usa el primer valor no vacío entre RVM
`vin` y `n_chasis`. Antes del JOIN, `notas_venta_raw` se reduce a una fila por
`chasis`: presencia de `fecha_factura`, mayor valor de `fecha_factura`, mayor
`fecha_nota_de_venta`, mayor completitud vendedor/sucursal y desempate alfabético.
Filas idénticas producen el mismo enriquecimiento. El JOIN final es 1:0/1 y no
multiplica filas RVM.

Coverage se calcula tras fecha, marca y modelo, antes de sucursal/vendedor,
porque esos atributos no existen para unidades no matcheadas. No se completa el
universo faltante con otras tablas.
