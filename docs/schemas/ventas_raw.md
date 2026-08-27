# `ventas_raw`

Snapshot comercial diario proveniente de `Estadisticas_de_Venta_por_Vista_20210920.xlsx`, hoja `Ventas`.

## Estrategia de carga

- Motor: `import_estadisticas_venta`
- Estrategia: `FULL_SNAPSHOT_REPLACE`
- Cada ejecución reemplaza completamente la tabla anterior.
- El RAW conserva los valores fuente; normalización de textos, fechas y dimensiones corresponde a capas derivadas.
- No deduplicar por VIN: un VIN puede tener múltiples operaciones comerciales válidas.

## Universo de marcas

Solo se cargan:

- `DFLM`
- `DFM`
- `FOTON`
- `ZNA`
- `ZNA DONGFENG`

El filtro se aplica sobre `desc_mae_marca` usando el valor normalizado con `TRIM()` para decidir inclusión, sin modificar el valor almacenado.

## Schema físico

Las 26 columnas se almacenan como `text`.

| Columna | Tipo |
|---|---|
| `id` | `text` |
| `nro_operacion` | `text` |
| `razon_social` | `text` |
| `cliente` | `text` |
| `ciudad` | `text` |
| `region` | `text` |
| `articulo` | `text` |
| `desc_articulo` | `text` |
| `nro_vin_chasis` | `text` |
| `nombre_usuario` | `text` |
| `fecha_factura` | `text` |
| `precio_vta` | `text` |
| `precio_vta_pesos_con_iva` | `text` |
| `id_sucursal_vta` | `text` |
| `desc_sucursal_vta` | `text` |
| `id_mae_marca` | `text` |
| `desc_mae_marca` | `text` |
| `id_tipo_operacion` | `text` |
| `desc_tipo_oper` | `text` |
| `nro_propuesta` | `text` |
| `fecha_propuesta` | `text` |
| `factura` | `text` |
| `nro_factura` | `text` |
| `fecha_eta` | `text` |
| `entidad_financiera` | `text` |
| `comision_entidad_finan` | `text` |

## Auditoría de referencia — 2026-08-27

- Filas: `45.701`
- VIN informados: `44.942` (`98,34%`)
- VIN distintos: `43.820`
- VIN repetidos: `1.121`; corresponden a múltiples operaciones, no a duplicados exactos.
- `fecha_eta`: `44.924` con dato (`98,30%`).
- Sucursal: `100%` de cobertura; 22 pares ID/nombre sin inconsistencias detectadas.
- `entidad_financiera`: `5.883` con dato (`12,87%`).
- `precio_vta` y `precio_vta_pesos_con_iva`: `100%` de cobertura.

Los espacios, padding y otros detalles de formato del origen se preservan en RAW y deben resolverse en tablas derivadas.
