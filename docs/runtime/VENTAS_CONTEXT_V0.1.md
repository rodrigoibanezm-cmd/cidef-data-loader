# VENTAS_CONTEXT_V0.1

`buildVentasContext()` es el contexto runtime compartido para motores comerciales basados en `ventas_raw`.

## Patrón

Inspirado en `buildAuditContext()` de `crm-xbrein-backend`:

```text
ventas_raw
  -> buildVentasContext()
  -> payload runtime validado
  -> micro-motores deterministas
  -> motor de familia
  -> JSON final
```

No crea tablas, vistas, materialized views ni datos persistentes.

## Convención de código

Los motores y helpers runtime se separan por responsabilidad.

```text
buildVentasContext.js          -> orquestación + lectura RAW
resolveVentasRecognition.js    -> regla VIN/fecha
ventasContextUtils.js          -> normalización + forma de venta
buildMonthlySales.js           -> agregado mensual
validateVentasContext.js       -> reconciliación + warnings
```

Regla de mantenibilidad: ningún `.js` nuevo de esta capa debe superar aproximadamente 100-120 líneas. Si crece, la responsabilidad debe separarse en un helper o micro-motor reusable.

## Fuente

```text
ventas_raw
```

Una sola lectura selecciona únicamente los campos necesarios para reutilización posterior.

## Regla de reconocimiento V0.1

```text
VIN no nulo
  -> una venta reconocida por VIN
  -> LAST fecha_factura global

VIN nulo/vacío
  -> una venta por fila
  -> sólo cuando fecha_factura es parseable
```

Si un VIN no nulo contiene alguna `fecha_factura` nula o inválida, ese VIN se excluye completo del contexto y se reporta en cobertura/warnings.

Si varias filas comparten exactamente la fecha LAST, el menor `id` estable se usa únicamente como desempate técnico.

## Payload

```text
context
version
policy
coverage
recognizedSales[]
monthlySales[]
validation
warnings
```

Cada elemento de `recognizedSales` conserva, desde la fila reconocida:

```text
vin
source_id
fecha_venta
fecha_venta_iso
mes_venta
recognition_basis
cliente
razon_social
sucursal_id
sucursal
vendedor
marca_id
marca
producto_sku
producto
nro_operacion
nro_propuesta
factura
nro_factura
precio_vta
precio_vta_pesos_con_iva
```

`monthlySales` es una derivación runtime de `recognizedSales`, no una fuente nueva.

## Validaciones

El contexto reconcilia:

```text
recognized_units == sum(monthlySales.sales)
recognized_units == assignable_non_null_vins + assignable_null_vin_rows
```

El snapshot observado antes de esta implementación tenía un universo esperado de 44.579 unidades; ese número es evidencia de referencia, no una constante del código.

## Consumo

Los motores posteriores deben aceptar opcionalmente `sharedContext`, siguiendo el patrón Xbrein:

```js
const ctx = sharedContext ?? await buildVentasContext();
```

Así, un motor compuesto puede leer `ventas_raw` una sola vez y reutilizar el mismo contexto entre múltiples cálculos.

## No objetivos

Esta pieza NO:

- expone una Action del Custom GPT;
- persiste `fact_venta`;
- crea un cubo o mart;
- resuelve todavía identidades MASTER;
- define expectativa, proyección o cierre;
- implementa reglas específicas de una pregunta final.

Las resoluciones MASTER o derivados adicionales deben incorporarse como micro-motores/context enrichers sólo cuando un consumidor real los necesite.
