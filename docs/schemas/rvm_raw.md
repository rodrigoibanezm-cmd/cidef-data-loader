# `rvm_raw`

Registro de mercado automotriz proveniente de archivos `RVM_*.xlsx` de ANAC.

Representa inscripciones de vehículos nuevos del mercado chileno y se usa como evidencia externa para análisis competitivo y de mercado.

## Estrategia de carga

- Motor: `import_rvm`
- Fuente: archivos `RVM_*.xlsx`
- Universo cargado: `Mercado = Livianos y Medianos`
- Los archivos se procesan secuencialmente.
- Un archivo ya cargado se identifica por `documento_origen` y no se vuelve a insertar.
- La tabla conserva trazabilidad por archivo y fila de origen.
- La normalización aplicada en ingesta es estructural: tipos numéricos/fecha, `TRIM`, mayúsculas y compactación básica de espacios en campos geográficos.
- No interpretar competencia, segmentos analíticos ni equivalencias de producto en RAW; esas reglas corresponden a capas derivadas.

## Schema físico

| Columna | Tipo |
|---|---|
| `ano` | `integer` |
| `mes` | `integer` |
| `dia` | `integer` |
| `tipo_original` | `text` |
| `tipo` | `text` |
| `descripcion_tipo` | `text` |
| `descripcion_segmento` | `text` |
| `marca` | `text` |
| `modelo_homologado` | `text` |
| `modeo_version` | `text` |
| `ano_fabricacion` | `integer` |
| `region` | `text` |
| `combustible` | `text` |
| `pbv` | `text` |
| `n_puertas` | `integer` |
| `n_asientos` | `integer` |
| `carga` | `numeric` |
| `comuna_adquisicion` | `text` |
| `region_propietario` | `text` |
| `prenda` | `text` |
| `vin` | `text` |
| `n_chasis` | `text` |
| `patente` | `text` |
| `calidad` | `text` |
| `ano_vin` | `integer` |
| `pais_vin` | `text` |
| `preinscrito` | `text` |
| `cantidad` | `integer` |
| `fecha` | `date` |
| `documento_origen` | `text` |
| `fecha_creacion_documento` | `timestamptz` |
| `fecha_ingesta` | `timestamptz` |
| `source_row` | `integer` |

## Semántica mínima

- `fecha`: fecha de inscripción derivada de `ano` + `mes` + `dia`.
- `tipo_original`: clasificación original entregada por la fuente.
- `tipo`: clasificación normalizada por la fuente RVM.
- `descripcion_tipo`: descripción textual del tipo de vehículo.
- `descripcion_segmento`: segmento declarado por RVM.
- `marca`: marca del vehículo inscrito.
- `modelo_homologado`: modelo homologado informado por RVM.
- `modeo_version`: versión del modelo. El nombre de columna conserva el typo histórico de origen (`Modeo Versión`).
- `ano_fabricacion`: año de fabricación informado.
- `region`: región asociada a la inscripción en el archivo fuente.
- `combustible`: combustible informado.
- `pbv`: peso bruto vehicular según fuente; se preserva como texto.
- `n_puertas`: número de puertas.
- `n_asientos`: número de asientos.
- `carga`: capacidad de carga informada.
- `comuna_adquisicion`: comuna de adquisición.
- `region_propietario`: región del propietario.
- `prenda`: indicador/valor de prenda informado por RVM.
- `vin`: VIN informado.
- `n_chasis`: número de chasis informado.
- `patente`: patente informada.
- `calidad`: calidad del propietario informada por fuente, por ejemplo persona natural o jurídica.
- `ano_vin`: año inferido/informado desde VIN por la fuente.
- `pais_vin`: país asociado al VIN según fuente.
- `preinscrito`: indicador de preinscripción.
- `cantidad`: cantidad informada por la fuente.
- `documento_origen`: nombre del archivo RVM desde el cual se cargó la fila.
- `fecha_creacion_documento`: timestamp del archivo fuente cuando está disponible.
- `fecha_ingesta`: timestamp de inserción en Neon.
- `source_row`: número de fila original dentro del XLSX.

## Auditoría de referencia — 2026-08-28

Branch Neon: `main`.

- Filas totales: `488.942`
- Rango de fechas: `2025-01-02` a `2026-07-31`
- `RVM_2025.xlsx`: `310.598` filas
- `RVM_2026.xlsx`: `178.344` filas
- Tamaño de tabla observado: `143 MB`
- Índices: ninguno definido actualmente.
- Constraints: ninguno definido actualmente.

## Rol arquitectónico

`rvm_raw` es evidencia externa de mercado.

No representa:

- ventas Cidef;
- inventario Cidef;
- operaciones comerciales internas;
- una definición fija de competencia.

La competencia y comparabilidad entre modelos deben calcularse en capas analíticas posteriores usando esta evidencia junto con reglas explícitas y recalculables.
