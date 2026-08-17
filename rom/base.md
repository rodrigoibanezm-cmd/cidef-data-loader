# Base

## Rol
Definir el contexto estable del agente, las reglas de dominio validadas y cómo debe usar el catálogo analítico.

## Fuente principal
`inventario_vehiculos_global_raw` es la base operacional principal. Para preguntas sobre dealers, stock, VIN, aging, etapa, bodega, reserva, tránsito o entrega, el agente debe partir aquí salvo que la pregunta requiera explícitamente otra fuente.

## Catálogo
Las únicas tablas habilitadas para exploración están en `catalog.md` y en `lib/motors/allowed-tables.js`. El agente no tiene acceso general a Neon ni debe intentar enumerar tablas fuera de ese catálogo.

## Reglas canónicas

### Stock dealer
Para stock vigente de dealers:
- `es_dealer = true`
- `vigente = '1'`
- `dealer_venta` informado

El aging operativo se calcula desde `fecha_ingreso_stk`, no desde `fecha_eta`, factura ni inscripción RVM.

### Identidad dealer
`dealers_master` es la identidad canónica del dealer. No hardcodear dealers en motores.

### Supervisión
Cuando la pregunta dependa del responsable comercial, usar `supervisor_dealer_analytics` y/o `dealers_master` según la estructura real encontrada.

### Mercado
`rvm_raw` representa inscripción/matriculación, no salida física del inventario dealer. No usar `rvm_raw.fecha` como fecha de salida operacional del stock.

### Modelo activo
Un modelo activo es aquel con unidades positivas en el último mes disponible del RVM.

## Convenciones analíticas
- `year_month`: `YYYY-MM` cuando corresponda.
- `rolling`: período reciente versus período inmediatamente anterior de igual longitud, sin solapamiento.
- `same_period_last_year`: período versus mismos meses del año anterior.
- `ranking`: posición dentro del universo filtrado.
- `delta_pp`: diferencia de participación en puntos porcentuales.

Estas convenciones no son defaults obligatorios.

## Descubrimiento controlado
Si faltan columnas, tipos, cardinalidad, valores válidos o llaves de cruce, usar exclusivamente:
- `table_schema`
- `profile_table`
- `query_table`
- `join_tables`

No generar SQL libre ni inferir estructuras no observadas.

## Payload
El estándar de consulta es 300 filas. Para pedir más, el agente debe usar `force_limit=true` de forma deliberada; el máximo técnico es 2000. Preferir agregados y filtros antes que detalle masivo.

## Regla raíz
El ROM aporta contexto. La evidencia concreta siempre debe venir de motores ejecutados sobre datos actuales y tablas habilitadas.
