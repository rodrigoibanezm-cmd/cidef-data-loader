# `geographic_market_analysis`

## Responsabilidad
Calcula share, ranking y evolución RVM por región o comuna. No estima share óptimo ni causalidad.

## Input
```json
{
  "level": "REGION | COMUNA",
  "universe": "ALL | CHINA",
  "brand": "FOTON | null",
  "segment": "TOTAL | <segmento>",
  "months": 12,
  "comparison": "none | rolling | same_period_last_year",
  "end_month": "YYYY-MM | null",
  "page": 1,
  "page_size": 50
}
```

`level` y `universe` son obligatorios. `page_size` admite 1–100. `CAMIONETA` se normaliza
a `PICK-UP`. El período termina en el último mes RVM, salvo `end_month` histórico explícito.

## Períodos
- `rolling`: N meses anteriores consecutivos, sin solapamiento.
- `same_period_last_year`: mismo intervalo desplazado 12 meses.
- `none`: `periodo_comparacion` es `null`.

## Reglas
- `ALL`: todas las filas con marca presente en `brands_master`.
- `CHINA`: solo `brands_master.origen_marca='CHINA'`.
- El denominador se calcula tras período, universo, segmento y geografía, antes de `brand`.
- Ranking por geografía: `unidades DESC, marca ASC`.
- `ranking_delta = ranking_anterior - ranking_actual`; positivo significa mejora.
- `trend`: `FLAT` si `ABS(delta_pp)<0.05`; si no, `UP` o `DOWN`; sin comparación, `null`.

## Output
El router agrega `ok` y `motor`. El motor devuelve filtros normalizados, `periodo_actual`,
`periodo_comparacion`, `pagination`, `summary` y `series`. Cada fila explicita `marca`,
`unidades_marca`, `unidades_universo`, `share_pct` y `ranking` como números JSON.

Con `brand`, las filas se limitan a esa marca después de calcular universo y ranking. Sin
`brand`, cada página contiene el ranking completo de cada geografía incluida. La paginación
es explícita y nunca trunca silenciosamente marcas dentro de una geografía.

## Fuentes
Lee `rvm_raw` (`fecha`, `region_propietario`, `comuna_adquisicion`,
`descripcion_segmento`, `marca`, `cantidad`) y `brands_master` (`marca`, `origen_marca`).
No escribe datos. Una llamada ejecuta solo este motor.
