# Motores RVM

## Principio
RVM no se limita a motores especializados. El agente puede consultar `rvm_raw` y maestros directamente mediante `table_schema`, `profile_table`, `query_table` y `join_tables`.

Los motores siguientes son contratos especializados existentes. Usarlos solo cuando coincidan exactamente con la pregunta.

## Lectura especializada

### `rvm_market_pareto`
Concentración/Pareto mensual por marca/modelo. Útil para preguntas de concentración; no sustituye una consulta general de RVM.

### `rvm_quality_audit`
Auditoría resumida de integridad y consistencia del RVM y maestros.

### `market_penetration`
Evolución/ranking de penetración mensual bajo su contrato existente.

### `geographic_market_analysis`
Share/ranking/evolución por región o comuna bajo su contrato documentado.

### `monthly_seasonality_analysis`
Estacionalidad mensual bajo su contrato documentado.

### `intramonth_week_curve`
Distribución intrames bajo su contrato documentado.

## Maestros y materializaciones del backend
Estos motores escriben o actualizan datos y no deben exponerse al GPT analítico read-only:
- `refresh_vehicle_models_master`
- `refresh_vehicle_versions_master`
- `classify_electrification`
- `refresh_active_vehicle_models`
- `refresh_market_penetration_monthly`
- `detect_pending_model_enrichment`
- `upsert_model_enrichment`
- `import_rvm`

## Tablas RVM accesibles al análisis general
- `rvm_raw`
- `brands_master`
- `vehicle_models_master`
- `vehicle_versions_master`
- `active_vehicle_models`
- `active_vehicle_models_history`
- `market_penetration_monthly_all`
- `market_penetration_monthly_china`

## Regla de diseño
No agregar un nuevo motor RVM solo porque aparezca una pregunta nueva. Primero intentar resolverla con motores generales. Crear un motor especializado cuando exista lógica determinista repetible, costo excesivo de composición o una regla de negocio que deba quedar estable y testeada.