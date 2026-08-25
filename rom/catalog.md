# Catálogo exploratorio

Este catálogo define qué datos puede explorar el GPT mediante `table_schema`, `profile_table`, `query_table` y `join_tables`. Es cerrado y está sincronizado con `lib/motors/allowed-tables.js`.

## Tablas permitidas

- `inventario_vehiculos_global_raw`: inventario operacional por VIN.
- `rvm_raw`: inscripciones o matriculaciones RVM.
- `dealers_master`: identidad canónica y atributos de dealers.
- `supervisor_dealer_analytics`: relación analítica dealer-supervisor.
- `brands_master`: maestro de marcas.
- `vehicle_models_master`: maestro histórico de modelos.
- `vehicle_versions_master`: maestro histórico de versiones.
- `active_vehicle_models`: snapshot de modelos activos.
- `active_vehicle_models_history`: historia mensual de modelos activos.
- `market_penetration_monthly_all`: penetración mensual sobre mercado total.
- `market_penetration_monthly_china`: penetración mensual sobre universo chino.
- `locales_master`: maestro de locales o sucursales.
- `persona_local`: relación persona-local.
- `personas_master`: maestro de personas.
- `forum_dealers_master`: maestro de dealers Forum.

`vin_olap` no usa este catálogo como interfaz: opera sobre `VIN_SEMANTIC_CUBE_V0.1` y no expone columnas físicas libres.
