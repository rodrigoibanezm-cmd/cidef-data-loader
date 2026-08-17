# Catálogo analítico fijo

## Rol
Definir las únicas tablas que el agente GPT puede explorar mediante los motores generales.

El agente no puede enumerar todas las tablas de Neon ni asumir acceso a una tabla que no aparezca aquí. El catálogo es deliberadamente acotado y debe mantenerse sincronizado con `lib/motors/allowed-tables.js` y `rom/schema.json`.

## Tablas permitidas

### Base operativa
- `inventario_vehiculos_global_raw`: fuente principal de inventario por VIN. Usar primero para preguntas de stock, estado, dealer, aging, etapa, bodega, entrega, reserva, tránsito y atributos operativos del vehículo.

### Mercado / RVM
- `rvm_raw`: matriculaciones/inscripciones RVM por vehículo, fecha, marca, modelo, segmento y geografía.
- `market_penetration_monthly_all`: penetración mensual contra mercado total.
- `market_penetration_monthly_china`: penetración mensual contra universo chino.

### Dealers y supervisión
- `dealers_master`: identidad canónica de dealers y atributos maestros.
- `supervisor_dealer_analytics`: tabla analítica de dealer/supervisor para contexto de supervisión.
- `forum_dealers_master`: maestro de dealers Forum.

### Red comercial / personas
- `locales_master`: maestro de locales/sucursales.
- `persona_local`: relación persona-local.
- `personas_master`: maestro de personas.

### Maestros de producto
- `brands_master`: maestro de marcas y atributos asociados.
- `vehicle_models_master`: maestro histórico de modelos.
- `vehicle_versions_master`: maestro histórico de versiones.
- `active_vehicle_models`: foto de modelos activos del último mes disponible.
- `active_vehicle_models_history`: historial mensual de modelos activos.

## Prioridad de uso
1. Partir por `inventario_vehiculos_global_raw` cuando la pregunta sea operacional o de dealer.
2. Consultar `rvm_raw` o penetraciones cuando se necesite contexto de mercado/inscripción.
3. Usar maestros solo para identidad, clasificación, contexto o joins necesarios.
4. Usar tablas de personas/locales solo si la pregunta exige estructura comercial o territorial.

## Regla de seguridad
Si una pregunta requiere una tabla fuera de este catálogo, el agente debe devolver `MISSING_CAPABILITY` o indicar que la fuente no está habilitada. No debe intentar descubrir ni acceder al resto de Neon.
