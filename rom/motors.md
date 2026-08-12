# Motors

## Rol
Definir el catálogo de motores que el agente puede invocar.

## Principio
Si un motor no aparece aquí, no existe para el agente.

## Motores

### profile_table
Responsabilidad: descubrir estructura básica de una tabla.
Input: `table`.
Devuelve: filas, columnas, nulos y cardinalidad.

### query_table
Responsabilidad: consultar datos con operaciones controladas.
Input: `table`, `operation` y parámetros de consulta.
Operaciones actuales: `select`, `aggregate`.

### import_inventario
Responsabilidad: recargar `inventario_vehiculos_global_raw` desde Drive.

### import_notas_venta
Responsabilidad: recargar `notas_venta_raw` desde Drive.

### import_estadisticas_venta
Responsabilidad: recargar `estadisticas_venta_raw` desde Drive.

### import_lista_precios
Responsabilidad: consolidar las listas de precios XLSB en `lista_precios_raw`.

### available_inventory
Responsabilidad: determinar el universo de vehículos nuevos disponibles para venta, a nivel VIN único.
Fuente: `inventario_vehiculos_global_raw`.

Reglas determinísticas del universo:
- `tipo = 'Vehiculo Nuevo'`
- `factura` nula o vacía
- `vigente = '1'`
- excluir `etapa IN ('VH', 'TL')`
- `fecha_eta` informada
- grano final: `vin_chasis` único
- antigüedad: `CURRENT_DATE - MIN(fecha_eta)` por VIN

Input opcional:
- `min_age_days`: antigüedad mínima; default `0`.
- `group_by`: actualmente acepta `bodega`.

Ejemplos:
- universo disponible: `{ "motor": "available_inventory" }`
- stock sobre 90 días: `{ "motor": "available_inventory", "min_age_days": 91 }`
- stock sobre 90 días agrupado por bodega: `{ "motor": "available_inventory", "min_age_days": 91, "group_by": "bodega" }`

Nota: `fecha_eta` está almacenada como texto con formato `MM/DD/YY HH24:MI`.

## Ejemplo
Para conocer columnas antes de consultar una tabla: usar `profile_table` y luego `query_table`.
