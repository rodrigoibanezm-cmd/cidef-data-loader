# `notas_venta_raw`

RAW diaria de notas de venta cargada desde `Listado_Notas_de_Venta_20210819.xlsx`, hoja `Hoja1`.

## Contrato de carga

- Motor: `import_notas_venta`
- Estrategia: `FULL_SNAPSHOT_REPLACE`
- Fuente: archivo completo diario
- Universo: `DFLM`, `DFM`, `FOTON`, `ZNA`, `ZNA DONGFENG`
- La comparación de marca usa texto normalizado; el RAW conserva el valor fuente.
- No se deduplica por VIN ni por nota de venta.
- No se agregan columnas derivadas ni enriquecimientos.
- Todos los campos se almacenan como `text`; la tipificación ocurre aguas abajo.

## Schema físico

| Columna | Tipo |
|---|---|
| `chasis` | `text` |
| `nro_operacion` | `text` |
| `nota_de_venta` | `text` |
| `fecha_nota_de_venta` | `text` |
| `fecha_creacion_nv` | `text` |
| `desc_sucursal_vta` | `text` |
| `vendedor` | `text` |
| `tiene_operacion` | `text` |
| `esta_autorizado` | `text` |
| `esta_pendiente_entrega` | `text` |
| `razon_social` | `text` |
| `cliente` | `text` |
| `region` | `text` |
| `comuna` | `text` |
| `ciudad` | `text` |
| `modelo` | `text` |
| `modelo_comercial` | `text` |
| `deposito_unidad` | `text` |
| `desc_mae_marca` | `text` |
| `factura` | `text` |
| `fecha_factura` | `text` |
| `precio_vta` | `text` |
| `precio_vta_pesos_con_iva` | `text` |
| `reserva` | `text` |
| `numero_recibo` | `text` |
| `importe` | `text` |
| `etapa` | `text` |
| `entidad_financiera` | `text` |
| `comision_entidad_finan` | `text` |
| `comentario` | `text` |

## Auditoría base — 2026-08-27

- Filas: 62.502
- Columnas: 30
- VIN/chasis informados: 62.463
- VIN distintos: 44.398
- VIN repetidos: 10.516
- Duplicados exactos sobre las 30 columnas: 0
- `nota_de_venta`, fechas de NV, sucursal y vendedor: 100% de cobertura
- `comentario`: 16.170 filas (25,87%)
- `entidad_financiera`: 12.893 filas (20,63%)

El grano no es `1 fila = 1 VIN` ni `1 fila = 1 NV`. Un mismo VIN/NV puede tener múltiples filas que representan variaciones del proceso comercial.

## Semántica relevante

`modelo` es el identificador técnico/SKU observado y se alinea casi completamente con `vehiculos_raw.modelo` y `ventas_raw.articulo`. `modelo_comercial` representa el nombre comercial y no identifica por sí solo una versión única.

`comentario` es texto libre y debe conservarse sin estructurar en RAW. En operaciones recientes existe un patrón relevante para canal dealer:

`razon_social = FÓRUM DISTRIBUIDORA S.A.` → `comentario` → dealer real.

Este patrón debe resolverse únicamente en capas derivadas/master. No debe confundirse con `entidad_financiera = FORUM`, que representa financiamiento de la operación.

## Regla arquitectónica

Esta tabla representa evidencia fuente. Cualquier normalización de fechas, precios, sucursales, producto, personas, dealers, flags o texto pertenece a MASTER/DERIVADOS y nunca al RAW.
