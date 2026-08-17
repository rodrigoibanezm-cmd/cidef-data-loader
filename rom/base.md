# Base

## Rol
Definir el contexto estable del dominio, las fuentes disponibles y las reglas que el agente no debe reinventar.

Este archivo no debe intentar anticipar todas las preguntas ni enumerar todos los valores posibles del negocio. Los valores reales de dimensiones como marca, segmento, modelo, región, dealer o vendedor se descubren desde las tablas mediante los motores generales.

## Dominios principales

### Mercado / RVM
- `rvm_raw`: fuente granular de matriculaciones RVM.
- `brands_master`: identidad y atributos de marcas.
- `vehicle_models_master`: maestro histórico de modelos.
- `vehicle_versions_master`: maestro histórico de versiones.
- `active_vehicle_models`: foto de modelos activos del último mes disponible.
- `active_vehicle_models_history`: historial mensual de modelos activos.
- `market_penetration_monthly_all`: penetración mensual contra mercado total.
- `market_penetration_monthly_china`: penetración mensual contra universo chino.

### Operación Cidef / vehículos
- `inventario_vehiculos_global_raw`: inventario granular por VIN; contiene clasificación dealer (`es_dealer`, `dealer_venta`, `dealer_rut`, `dealer_nombre`) y atributos operativos del vehículo.
- `notas_venta_raw`: notas de venta y atributos comerciales asociados a VIN/chasis.
- `estadisticas_venta_raw`: estadísticas comerciales históricas.
- `lista_precios_raw`: lista de precios disponible para análisis.

### Dealers
- `dealers_master`: identidad canónica de dealers y asignación de supervisor cuando corresponda.
- `dealer_sucursales`: relación dealer-sucursal-región/comuna; un dealer puede existir en más de una región.
- `supervisor_dealer_analytics`: tabla analítica granular de VIN/dealer preparada para análisis del supervisor.

## Convenciones
- `year_month`: período mensual `YYYY-MM` cuando un motor lo requiera.
- `rolling`: período reciente versus el período inmediatamente anterior de igual longitud, sin solapamiento.
- `same_period_last_year`: período versus los mismos meses del año anterior.
- `ranking`: posición dentro del universo y filtros consultados.
- `delta_pp`: diferencia de participación expresada en puntos porcentuales.

Estas convenciones son herramientas, no defaults obligatorios. El agente debe usar solo las que correspondan a la pregunta.

## Reglas canónicas conocidas

### Modelo activo
Un modelo activo es aquel con unidades positivas en el último mes disponible del RVM.

### Stock dealer
Cuando se analice stock vigente de dealers, la regla validada es:
- `es_dealer = true`
- `vigente = '1'`
- `dealer_venta` informado

El aging operativo de stock dealer se calcula desde `fecha_ingreso_stk`, no desde `fecha_eta` ni desde la fecha de factura.

### Identidad dealer
`dealers_master` es la identidad canónica. No hardcodear listas de dealers dentro de motores analíticos.

### Geografía dealer
No asumir una única región por dealer. La geografía debe resolverse desde `dealer_sucursales` cuando la pregunta requiera zona, región, comuna o sucursal.

## Descubrimiento
Si el agente no conoce con certeza:
- columnas reales,
- tipos,
- cardinalidad,
- valores válidos,
- llaves de cruce,

debe descubrirlos mediante `table_schema`, `profile_table`, `query_table` o `join_tables` en vez de completar desde este ROM.

## Regla raíz
El ROM aporta contexto y reglas validadas. La evidencia analítica siempre debe provenir de motores ejecutados sobre datos actuales.