# `geographic_market_analysis`

## Estado
Motor especializado de lectura. No es el punto de partida obligatorio para preguntas geográficas: el agente puede explorar `rvm_raw`, `dealer_sucursales` y otras tablas mediante motores generales cuando necesite otra granularidad o lógica.

## Responsabilidad
Calcula share, ranking y evolución RVM por región o comuna bajo un contrato fijo. No estima causalidad, potencial óptimo ni riesgo futuro.

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

Los valores concretos de marcas/segmentos deben validarse contra datos actuales; no inferirlos desde este ROM.

## Reglas del contrato
- `rolling`: N meses anteriores consecutivos, sin solapamiento.
- `same_period_last_year`: mismo intervalo desplazado 12 meses.
- El denominador se calcula tras período, universo, segmento y geografía, antes del filtro de marca.
- Ranking por geografía: unidades descendentes y marca como desempate.
- El motor no debe reutilizarse para geografía dealer: esa dimensión pertenece a `dealer_sucursales`.

## Fuentes
Lee `rvm_raw` y `brands_master`. No escribe datos.

## Cuándo no usarlo
Si la pregunta requiere VIN, dealer, sucursal dealer, otra dimensión geográfica, joins con inventario o una comparación no soportada, usar motores generales o declarar `MISSING_CAPABILITY`.