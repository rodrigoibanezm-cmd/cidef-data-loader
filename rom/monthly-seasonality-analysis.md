# `monthly_seasonality_analysis`

## Estado
Motor especializado de lectura para estacionalidad mensual. No reemplaza el análisis temporal general con `query_table` sobre `rvm_raw` u otras tablas.

## Responsabilidad
Mide patrones mensuales históricos de matriculaciones bajo su contrato actual. MARKET y CIDEF son scopes separados; la fecha base es `rvm_raw.fecha`.

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

Los valores de dimensiones deben validarse contra datos actuales.

## Límites
- MARKET: TOTAL, MARCA, MODELO.
- CIDEF: además SUCURSAL y VENDEDOR bajo el join implementado.
- No usar este motor para inventario dealer, aging, proyección o causalidad.
- Si la pregunta necesita otra granularidad, período o comparación, usar motores generales.

## Join CIDEF
El join RVM/notas se realiza con la normalización y deduplicación implementadas por el motor. La cobertura del match forma parte del resultado y debe considerarse antes de concluir.

## Regla de uso
Usarlo cuando la pregunta sea explícitamente de estacionalidad mensual y el contrato baste. Para preguntas temporales nuevas, explorar primero con motores generales y promover una lógica a motor solo si se vuelve repetible.