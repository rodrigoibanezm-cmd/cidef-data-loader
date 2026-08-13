# Motores RVM

## `refresh_vehicle_models_master`
- Responsabilidad: insertar modelos por `brand_id + modelo_homologado` sin borrar históricos.
- Input: `{}`.
- Output: `{created_models, existing_models, pending_brands, pending_brand_rows}`.
- Lee: `rvm_raw`, `brands_master`, `vehicle_models_master`.
- Escribe: `vehicle_models_master`.
- Dependencia: `brands_master` actualizado.
- Ejemplo: `{"motor":"refresh_vehicle_models_master","input":{}}`.

## `refresh_vehicle_versions_master`
- Responsabilidad: insertar versiones y completar combustible antes nulo.
- Input: `{}`.
- Output: `{created_versions, updated_versions, pending_versions}`.
- Lee: `rvm_raw`, `brands_master`, `vehicle_models_master`, `vehicle_versions_master`.
- Escribe: `vehicle_versions_master`.
- Dependencia: ejecutar después de `refresh_vehicle_models_master`.
- Ejemplo: `{"motor":"refresh_vehicle_versions_master","input":{}}`.

## `classify_electrification`
- Responsabilidad: clasificar versiones solo con evidencia de combustible/nombre.
- Input: `{}`.
- Output: `{ICE, HEV, PHEV, BEV, PENDIENTE}`.
- Lee/escribe: `vehicle_versions_master`.
- Dependencia: ejecutar después de refrescar versiones.
- Ejemplo: `{"motor":"classify_electrification","input":{}}`.

## `rvm_market_pareto`
- Responsabilidad: calcular concentración mensual por marca/modelo.
- Input: `{universe, segment, brand, threshold_pct, period}`.
- Defaults: `ALL`, `null`, `null`, `80`, último mes.
- Output: período, filtros, unidades, cantidad de modelos y ranking acumulado.
- Lee: `rvm_raw`, `brands_master`. No escribe.
- Dependencia: `brands_master.origen_marca` para universo `CHINA`.
- Ejemplo: `{"motor":"rvm_market_pareto","input":{"universe":"CHINA"}}`.

## `rvm_quality_audit`
- Responsabilidad: resumir integridad y consistencia de todo el RVM.
- Input: `{}`.
- Output: `{ok, period, checks, critical_issues, warnings}`.
- Lee: RVM y maestros; no escribe.
- Dependencias: maestros y snapshot activo existentes.
- `period` informa el último mes disponible como referencia.
- Ejemplo: `{"motor":"rvm_quality_audit","input":{}}`.

## Orden de actualización
1. `import_rvm`
2. `refresh_vehicle_models_master`
3. `refresh_vehicle_versions_master`
4. `classify_electrification`
5. `refresh_active_vehicle_models`
6. materializaciones analíticas existentes
