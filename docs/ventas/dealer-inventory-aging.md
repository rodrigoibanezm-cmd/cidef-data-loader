# Aging de inventario en dealers

## Objetivo
Identificar VIN que siguen vigentes en la red de dealers y medir su antigüedad, agrupados por dealer.

## Regla validada
El universo de stock dealer es:

- `es_dealer = true`
- `vigente = '1'`
- `dealer_venta` informado
- `fecha_ingreso_stk` informada

El aging se calcula desde `fecha_ingreso_stk`, no desde `fecha_eta`:

`aging_dias = fecha_consulta - fecha_ingreso_stk`

Por defecto, el motor reporta unidades con `aging_dias > 60`.

## Identidad de dealer

`dealers_master` es la fuente canónica de identidad. El motor hace `LEFT JOIN` por `dealer_venta = dealers_master.dealer` y devuelve `dealer_id` cuando existe resolución canónica.

El `LEFT JOIN` es deliberado mientras queden dealers históricos todavía no incorporados a `dealers_master`: evita perder stock ya clasificado. Ver `docs/ventas/dealers-master.md`.

## Por qué no usar factura
Una unidad financiada por Forum puede tener factura emitida a `FÓRUM DISTRIBUIDORA S.A.` y seguir vigente comercialmente en el dealer. Por eso `factura IS NULL` no define stock dealer.

## Por qué no usar fecha_eta
Se validó contra un caso real de Rosselot. El VIN `LVAV2MAB1TU480531` estaba vigente, asignado a `AUTOMOTRIZ ROSSELOT S.A.`, con `fecha_ingreso_stk = 5/30/26` y `fecha_eta = 6/10/26`. El aging operativo observado correspondía al ingreso a stock.

## Motor
`dealer_inventory_aging`

Inputs opcionales:

- `min_days`: entero >= 0; default `60`.
- `dealer`: nombre exacto de `dealer_venta`.
- `as_of`: fecha `YYYY-MM-DD`; default `CURRENT_DATE`.

Output: una fila por dealer con `dealer_id`, `dealer`, `vins`, `aging_min`, `aging_max` y `aging_promedio`.
