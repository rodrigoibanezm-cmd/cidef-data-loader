# `vehiculos_raw`

Snapshot diario sanitizado de la hoja `Inventario Vehiculos Global` del archivo `Base_Unidades_por_Vistas_20210819.xlsx`.

La tabla se reemplaza completamente en cada ejecución de `import_vehiculos` (`FULL_SNAPSHOT_REPLACE`). Solo contiene columnas provenientes de la fuente; no incluye enriquecimientos ni columnas derivadas.

El loader conserva únicamente `TIPO = Vehiculo Nuevo` y deduplica por `vin_chasis`.

| Columna | Tipo |
|---|---|
| `nro_stock` | `text` |
| `vin_chasis` | `text` |
| `marca` | `text` |
| `modelo` | `text` |
| `patente` | `text` |
| `ano` | `text` |
| `color` | `text` |
| `etapa` | `text` |
| `bodega` | `text` |
| `vigente` | `text` |
| `fecha_nv` | `text` |
| `nota_de_venta` | `text` |
| `vendedor` | `text` |
| `factura` | `text` |
| `numero_factura` | `text` |
| `fecha_factura` | `text` |
| `rut` | `text` |
| `cliente` | `text` |
| `fecha_entrega_planificada` | `text` |
| `pendiente_entrega` | `text` |
| `esta_fisico` | `text` |
| `esta_reservado` | `text` |
| `esta_en_transito` | `text` |
| `en_patio` | `text` |
| `fecha_ingreso_stk` | `text` |
| `tipo_ficha` | `text` |
| `fecha_eta` | `text` |
