# intramonth_week_curve

## Responsabilidad
Mide la distribución intrames de matriculaciones RVM. La fecha base siempre es
`rvm_raw.fecha`; MARKET y CIDEF nunca se mezclan.

## Input
Usa el mismo contrato rígido de `monthly_seasonality_analysis`: `scope`
obligatorio, `group_by` default TOTAL, filtros `brand`, `model`, `branch`,
`seller`, rango `date_from`/`date_to` y paginación `page`/`page_size` por valores
de grupo. MARKET admite TOTAL, MARCA y MODELO. CIDEF además admite SUCURSAL y
VENDEDOR. `page_size` máximo es 100; TOTAL no se pagina.

## Buckets
- W1: días 1-7.
- W2: días 8-14.
- W3: días 15-21.
- W4: días 22-28.
- W5: días 29-fin de mes.
- Últimos 7 días: desde `fin de mes - 6 días` hasta fin de mes, inclusivo.

`last_week_share_pct` equivale a W5 por definición. No equivale a
`last_7_days_share_pct` salvo coincidencia accidental.

## Output
- `periodo`, `coverage` y `pagination`: mismo significado que el motor mensual.
- `series`: año-mes, grupo, unidades, shares W1-W5,
  `last_week_share_pct` y `last_7_days_share_pct`.
- `summary`: promedio histórico de cada share, promedio/mediana/mínimo/máximo de
  últimos 7 días y cantidad de meses observados.

Todos los valores cuantitativos son números JSON. Shares se redondean a 4
decimales. Los promedios históricos pesan cada mes por igual.

## JOIN CIDEF
El JOIN normaliza chasis con `UPPER(TRIM())` y usa RVM `vin`, o `n_chasis` si
`vin` está vacío. `notas_venta_raw` se deduplica antes del JOIN: presencia de
`fecha_factura`, mayor `fecha_factura`, mayor `fecha_nota_de_venta`, completitud
de vendedor/sucursal y desempate alfabético. Así cada fila RVM encuentra como
máximo una fila de notas.

Coverage aplica fecha, marca y modelo antes del match; sucursal/vendedor se
aplican solo al universo matcheado. No se intenta completar los no matcheados.
