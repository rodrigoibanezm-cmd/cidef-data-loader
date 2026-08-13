# Proyección de ventas desde histórico — contexto de trabajo

Fecha de corte: 2026-08-13

## Objetivo

Construir una metodología determinista para proyectar cierre mensual de ventas Cidef desde el avance intrames histórico, con granularidad final por tienda y dimensión marca.

Preguntas objetivo:
- ¿Desde qué día del mes se puede proyectar el cierre con precisión útil?
- ¿Qué intervalo/confianza tiene la proyección (objetivo conceptual: 95%)?
- ¿Cómo cambia por tienda y marca?
- ¿Cuánto aporta W1, W2, W3 y W4+W5 al cierre?

No se busca inicialmente un modelo complejo. Prioridad: modelo simple, interpretable y validado históricamente; agregar econometría solo donde la data lo justifique.

## Motores analíticos ya implementados

- `monthly_seasonality_analysis`
- `intramonth_week_curve`

Ambos están desplegados y funcionando.

Hallazgo MARKET 2025-01 a 2026-07:
- Últimos 7 días: media 39.33% del mes.
- W1: 17.75%
- W2: 17.13%
- W3: 18.08%
- W4: 27.47%
- W5: 19.58%

Esto motivó estudiar si el cierre mensual puede inferirse desde D7/D14/D21.

## Tablas analíticas exploratorias creadas

Se trabajó con tablas/vistas intermedias intrames para evitar consultar raw constantemente.

Cobertura observada:
- 2020-04 a 2026-08
- 77 meses
- `cidef_intramonth_weekly`: 7.305 filas, 24 sucursales, 12 marcas.

Granularidad discutida para análisis: mes × tienda × marca × tramo intrames.

Tramos preferidos: W1, W2, W3, W4+W5. Para inferencia también se analizaron acumulados D7, D14 y D21.

## Homogeneidad histórica

Se descartó conceptualmente 2020-2021 para estudiar estabilidad porque fueron años anómalos por pandemia, problemas de importación/logística, esperas de vehículos de 6-8 meses, retiros AFP y bonos estatales.

Para 2022 en adelante se obtuvo inicialmente:
- meses: 55
- D7 media: 12.41%, SD 3.63
- D14 media: 29.09%, SD 5.71
- D21 media: 46.55%, SD 8.54
- D21 p2.5: 33.47%
- D21 p97.5: 64.26%

Se revisaron extremos mes a mes. Algunos D21 muy anómalos:
- 2025-02: 75.54%
- 2022-02: 65.05%
- 2022-01: 62.81%
- 2024-05: 32.50%
- 2025-01: 33.02%

La conclusión fue NO eliminar años completos automáticamente. Primero explicar outliers por tienda, marca, canal y tipo de vehículo.

## Hallazgo crítico: mezcla de universos comerciales

El análisis de 2025-02 mostró que el outlier no era un comportamiento general del retail.

Casa Matriz concentraba 253 de 560 unidades (~45%). Dentro de Casa Matriz, FOTON explicaba prácticamente el shock y el vendedor `DLOBOS` concentraba:
- 208 de 210 VIN FOTON del mes.
- 102 de 103 VIN FOTON de W3.

Se confirmó conceptualmente que estos vendedores pueden representar canal dealer/mayorista y no una tienda retail comparable.

Además, Casa Matriz históricamente llega a representar ~40-55% de registros en muchos meses. Por tanto, `desc_sucursal_vta` mezcla poblaciones comerciales distintas y no debe interpretarse automáticamente como tienda física.

## Hallazgo crítico: mezcla de tipos de vehículo

Se detectó que Bilbao corresponde a MOTOS. Esto reveló que las tablas analíticas construidas hasta ahora NO habían sanitizado correctamente el universo por tipo de vehículo.

Este error invalida usar directamente los resultados actuales para construir el forecast definitivo.

Regla acordada: antes de modelar ventas hay que construir un universo canónico de vehículos correspondiente al negocio que realmente queremos analizar. No excluir casos manualmente por nombre de sucursal cuando la exclusión correcta deriva del tipo de vehículo.

## Fuentes raw: comparación

### `notas_venta_raw`

Se considera actualmente el mejor backbone de ventas porque tiene mayor cobertura y contiene vendedor, sucursal, marca, modelo, fechas y variables comerciales.

VIN únicos comparados:
- notas: 51.028
- estadísticas: 50.460
- overlap: 50.460
- solo notas: 568
- solo estadísticas: 0

Conclusión: `estadisticas_venta_raw` está completamente contenida por VIN dentro de `notas_venta_raw`; la diferencia parece principalmente actualización/cobertura.

### `estadisticas_venta_raw`

Tiene 51.612 filas / 50.460 VIN para `Venta Rodados`, `es_especial=0`.
Tiene 752 filas `es_especial=1`, pero sin VIN.

Puede utilizarse para enriquecer campos cuando aporte información mejor que notas, pero no parece necesario mantener dos universos analíticos paralelos.

### `inventario_vehiculos_global_raw`

Es la fuente relevante para enriquecer clasificación física/tipo del vehículo y bodega.

Columnas importantes identificadas:
- VIN/chasis
- `tipo`
- `tipo_ficha`
- `tipo_motor`
- `detalle_vehiculo`
- `bodega`
- `id_emp_sucursal`

`tipo = 'Vehiculo Nuevo'` no basta necesariamente para distinguir autos, motos, camiones, etc. La clasificación canónica debe usar los campos específicos de vehículo.

## Decisión de arquitectura de datos

No borrar ni transformar las tablas raw.

Crear una única capa/tablas canónicas sanitizadas para análisis. Objetivo: dejar de decidir en cada análisis si consultar notas, estadísticas o inventario.

Backbone propuesto:

`notas_venta_raw` → deduplicación VIN/venta → enriquecimiento por VIN desde inventario/estadísticas → clasificación canónica → tabla de ventas limpia.

La tabla canónica debe incluir al menos:
- VIN/chasis
- operación / nota / factura
- fecha nota
- fecha factura
- vendedor
- sucursal administrativa de venta
- marca
- modelo
- clasificación/tipo de vehículo
- bodega
- variables económicas útiles
- campos de proceso/cliente que se decida conservar

Todo motor analítico futuro debería consultar esta capa y no raw directamente.

## Locales propios

Existe `locales_master`, actualmente con 13 locales activos:

1. Bellavista — bodega 31300
2. Pajaritos — 31304
3. Plaza Norte — 31447
4. Plaza Sur — 31453
5. Plaza Oeste — 31457
6. Plaza Vespucio — 31458
7. Plaza Egaña — 31459
8. Mall Plaza Trébol — 31570
9. Plaza Alameda — 31580
10. Vicuña Mackenna — 31590
11. Quilín — 31620
12. Costanera Center — 31630
13. Espacio Urbano Antofagasta — 30205

Algunas tiendas son nuevas, por lo que no deben exigirse 13 tiendas durante toda la historia. Cada tienda entra al modelo desde que tiene cobertura suficiente.

## Bodega vs sucursal

Se desconfía de `desc_sucursal_vta` como representación directa de tienda física porque contiene Casa Matriz, concesionarios, canales especiales y etiquetas históricas.

`inventario_vehiculos_global_raw.bodega` contiene código + descripción. Ejemplos:
- 31300-CIDEF SANTA MARIA
- 31457-CIDEF PLAZA OESTE
- 31458-CIDEF MALL PLAZA VESPUCI
- 31447-CIDEF PLAZA NORTE
- 31570-CIDEF MALL PLAZA TREBOL
- 31630-CIDEF COSTANERA CENTER

Pero `bodega` tampoco equivale automáticamente a tienda: también contiene patios logísticos, barcos, restringidos, dealers, talleres, consignaciones, etc.

La ventaja es que `locales_master.bodega_codigo` permite identificar de forma determinista las bodegas asociadas a locales propios.

Pendiente validar semánticamente qué representa la bodega del VIN respecto de la tienda que efectivamente realizó la venta. No asumir todavía que bodega = tienda de venta.

## Granularidad del forecast

Decisión vigente:
- forecast principal por TIENDA.
- MARCA es dimensión importante y debe conservarse porque comercialmente existen distintos Product Managers/responsables.
- agregado Cidef se obtiene desde unidades inferiores, no mezclando canales heterogéneos.

Para V1 se busca trabajar con tiendas propias inequívocamente identificadas y vehículos del universo correcto.

Bellavista fue cuestionada inicialmente porque distorsionaba volumen, pero NO debe excluirse todavía por regla manual: primero hay que determinar si el problema era mezcla de tipo/canal y si puede clasificarse correctamente con la capa canónica.

## Principios estadísticos/modelo acordados

1. No proyectar todavía agosto 2026 hasta limpiar correctamente el universo.
2. Primero caracterizar la distribución histórica del avance intrames.
3. No asumir homogeneidad; medirla.
4. No eliminar años/meses por intuición si el outlier puede explicarse por mezcla de canal, tienda, marca o tipo de vehículo.
5. Usar 2020-2021 con cautela; para estabilidad inicial se decidió estudiar 2022+.
6. Preferir modelo simple antes que regresión compleja.
7. Posible enfoque: distribución histórica condicional del porcentaje acumulado al día D y estimación de cierre = ventas acumuladas / porcentaje esperado acumulado.
8. La incertidumbre debe estimarse empíricamente mediante backtesting, no declarar “95%” por construcción.
9. Evaluar D7, D14, D21 y eventualmente cada día para determinar desde qué fecha el intervalo/error histórico alcanza precisión operacional útil.
10. Validar por tienda y marca; el tamaño muestral será menor y puede requerir pooling/shrinkage hacia patrones agregados.

## Estado actual / siguiente paso

NO continuar todavía con forecast de agosto.

Siguiente trabajo recomendado:

1. Diseñar la tabla canónica de ventas.
2. Definir explícitamente qué `tipo_ficha`/clasificaciones forman el universo de vehículos a incluir.
3. Deduplicar por VIN con reglas deterministas ya usadas en motores de seasonality.
4. Enriquecer notas con clasificación y bodega desde inventario; usar estadísticas solo para campos faltantes/útiles.
5. Validar relación `bodega` ↔ `locales_master` ↔ `desc_sucursal_vta` antes de definir tienda de venta.
6. Reconstruir las tablas intrames sobre el universo sanitizado.
7. Repetir homogeneidad D7/D14/D21.
8. Identificar outliers restantes y explicar si son tienda, marca, calendario o evento comercial.
9. Backtestear forecast por día de corte y obtener error/intervalos empíricos.
10. Solo después proyectar el mes corriente.

## Nota de implementación

Los schemas de las tablas están documentados en `docs/schemas` del repositorio. Consultarlos antes de volver a pedir `information_schema` para columnas ya conocidas.
