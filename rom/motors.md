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

## Ejemplo
Para conocer columnas antes de consultar una tabla: usar `profile_table` y luego `query_table`.
