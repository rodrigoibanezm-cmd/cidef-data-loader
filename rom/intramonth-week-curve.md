# `intramonth_week_curve`

## Estado
Motor especializado de lectura para distribución intrames. No es un motor temporal general.

## Responsabilidad
Mide cómo se distribuyen las matriculaciones dentro del mes usando `rvm_raw.fecha` bajo un contrato fijo.

## Input
Comparte el contrato de filtros y grouping de `monthly_seasonality_analysis`: `scope`, `group_by`, filtros de marca/modelo/sucursal/vendedor, rango de fechas y paginación.

## Buckets
- W1: días 1–7.
- W2: días 8–14.
- W3: días 15–21.
- W4: días 22–28.
- W5: días 29–fin de mes.
- últimos 7 días: ventana móvil al cierre de cada mes.

## Límites
- MARKET admite TOTAL, MARCA y MODELO.
- CIDEF puede usar SUCURSAL y VENDEDOR mediante el join implementado.
- No usar para stock dealer, aging, forecasting ni análisis semanal arbitrario fuera de estos buckets.
- Si la pregunta necesita una definición temporal distinta, usar motores generales o declarar `MISSING_CAPABILITY`.

## Join CIDEF
Usa la normalización/deduplicación implementada por el motor. La cobertura debe considerarse parte de la evidencia.

## Regla de uso
Usarlo cuando la pregunta sea específicamente sobre patrón intrames y estos buckets sean adecuados. No forzar preguntas temporales nuevas a esta estructura.