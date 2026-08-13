# Base

## Rol
Definir el vocabulario estable del dominio y las tablas canónicas que los motores pueden usar.

## Variables
- `universe`: `ALL` o `CHINA`.
- `segmento`: `SUV`, `PICK-UP`, `VEHÍCULO DE PASAJEROS`, `VEHÍCULO COMERCIAL`.
- `microsegmento`: subdivisión objetiva dentro de un segmento.
- `year_month`: período mensual `YYYY-MM`.
- `penetracion_pct`: participación de una marca dentro del universo comparable.
- `ranking`: posición de una marca dentro del universo consultado.
- `delta_pp`: diferencia de penetración entre períodos.
- `rolling`: últimos N meses versus los N inmediatamente anteriores, sin solapamiento.
- `same_period_last_year`: últimos N meses versus los mismos meses del año anterior.
- `largo_mm`: largo del modelo.
- `cilindrada_cc`: cilindrada del motor térmico.
- `rango_motor`: `LT_1_5`, `1_5_TO_2_5`, `GT_2_5`, `NA_BEV` o `PENDIENTE`.

## Tablas principales
- `rvm_raw`: registros normalizados provenientes del RVM.
- `brands_master`: maestro de marcas y origen.
- `vehicle_models_master`: catálogo histórico de modelos y atributos estructurales.
- `active_vehicle_models`: foto de modelos activos del último mes disponible.
- `active_vehicle_models_history`: historial mensual de modelos activos.
- `market_penetration_monthly_all`: penetración mensual contra mercado total.
- `market_penetration_monthly_china`: penetración mensual contra universo chino.

## Regla de actividad
Un modelo activo es aquel con unidades positivas en el último mes disponible del RVM.
