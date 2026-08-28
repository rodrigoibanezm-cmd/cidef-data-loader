# CANONICAL_ANALYTICS_V0.1

## Objetivo

Definir la arquitectura analítica objetivo V0.1 de Cidef sobre las RAW actuales y fijar los grains canónicos antes de implementar tablas físicas.

La arquitectura separa explícitamente:

- evidencia fuente;
- identidad;
- hechos canónicos;
- métricas certificadas;
- marts/cubos;
- motores determinísticos;
- interpretación LLM.

```text
FUENTES
↓
RAW
↓
DIMENSIONES CONFORMADAS
↓
CAPA CANÓNICA
↓
MÉTRICAS CERTIFICADAS
↓
MARTS / CUBOS
↓
8 MOTORES
↓
LLM / Workspace / PressureBoard
```

---

# 1. RAW

Las RAW preservan evidencia de origen y se actualizan mediante snapshot completo.

Fuentes actuales principales:

- `vehiculos_raw`
- `ventas_raw`
- `notas_venta_raw`

Principio:

> RAW conserva lo que dijo la fuente. No resuelve identidad ni redefine métricas de negocio.

---

# 2. Dimensiones conformadas

Las dimensiones resuelven **qué es la entidad** y deben ser compartidas por todos los hechos y motores.

V0.1:

- `dim_producto`
- `dim_sucursal`
- `dim_persona`
- `dim_dealer`
- `dim_tiempo`

El diseño detallado de identidad, aliases, persistencia y conflictos está en:

`docs/master/MASTER_LAYER_V0.1.md`

Estas dimensiones no deben redefinirse por motor ni por cubo.

---

# 3. Capa canónica

La capa canónica representa la realidad operacional a un grain explícito y estable.

## `vehiculo_canonico`

**Grain:** una fila por VIN actual.

La evidencia de `vehiculos_raw` soporta este grain:

- 46.390 filas;
- 46.382 VIN distintos;
- 0 VIN no nulos duplicados después de la depuración vigente.

Representa la entidad operacional actual del vehículo, no un historial diario de snapshots.

Debe poder vincularse a:

- producto;
- stock;
- fechas relevantes;
- bodega/ubicación fuente;
- NV/factura cuando corresponda;
- estados actuales relevantes.

V0.1 no historiza estados por snapshot. El aging debe derivarse prioritariamente desde hitos temporales fuente y estado actual.

## `fact_operacion`

**Grain:** una unidad dentro de un proceso comercial.

Clave conceptual aproximada:

```text
nota_de_venta + nro_operacion + VIN
```

No debe definirse como una fila por NV.

Evidencia de `notas_venta_raw`:

- 62.502 filas;
- 35.058 NV distintas;
- 7.847 NV contienen múltiples VIN;
- 7.820 NV contienen múltiples `nro_operacion`;
- una NV puede contener hasta 4 VIN;
- `NV + nro_operacion + VIN` produce 45.597 combinaciones canónicas observadas;
- repeticiones físicas de esa combinación no presentan conflictos relevantes en factura, fechas o precio.

La NV y `nro_operacion` son agrupadores del proceso; no sustituyen el grain unidad.

`fact_operacion` representa trayectoria comercial y debe conservar los hitos necesarios para medir flujo y aging, por ejemplo:

- creación NV;
- fecha NV;
- reserva;
- autorización;
- factura;
- fecha factura;
- entrega/pendiente entrega cuando la fuente lo permita;
- etapa/estado actual.

## `fact_venta`

**Grain:** una unidad vendida reconocida por negocio.

Clave conceptual aproximada:

```text
nro_operacion + nro_propuesta + VIN
```

Evidencia de `ventas_raw`:

- 45.701 filas;
- 20.807 `nro_operacion` distintos;
- 43.820 VIN distintos;
- 38.605 facturas distintas;
- 6.537 operaciones contienen múltiples VIN;
- una operación puede contener hasta 30 VIN;
- `nro_operacion + nro_propuesta + VIN` es única en las 45.701 filas observadas.

Por tanto, `nro_operacion`, propuesta y factura son agrupadores o atributos del hecho; no son sustitutos del conteo de unidades.

Conceptualmente:

```text
fact_operacion
= trayectoria/proceso de una unidad

fact_venta
= resultado comercial reconocido para una unidad
```

Una operación puede producir una venta, pero ambas tablas no representan el mismo hecho.

## `fact_mercado`

**Grain:** un hecho externo individual de mercado.

Su contrato se definirá al incorporar RVM/ANAC y otras fuentes externas. No debe forzarse desde las tres RAW actuales.

---

# 4. Regla transversal de grain

Regla V0.1:

> Toda métrica de unidades se calcula desde grain unidad.

Por tanto:

```text
NV
operación
propuesta
factura
```

son dimensiones, atributos o agrupadores del hecho según el análisis, pero no sustitutos del conteo de unidades.

Esto evita doble conteo y separa correctamente:

- trayectoria comercial;
- venta efectiva;
- estado actual del vehículo.

---

# 5. Métricas certificadas

La capa de métricas define **cómo medimos** y debe ser común a todos los motores.

Los motores no deben redefinir conceptos básicos.

Ejemplos de métricas que deberán tener un único contrato:

- `ventas_unidades`
- `stock_unidades`
- `stock_disponible`
- `aging_stock`
- `aging_nv_factura`
- `tiempo_creacion_nv`
- `tiempo_factura_entrega`
- `cumplimiento`
- `participacion_mercado`

Principio:

```text
hechos = qué ocurrió
métricas = cómo se mide
motores = qué significa para una pregunta de negocio
```

El aging histórico debe derivarse desde hitos `fecha_in` / `fecha_out` cuando existan. Para casos abiertos:

```text
aging_actual = fecha_actual - fecha_in
```

Esto permite comparar ciclos cerrados históricos con procesos actualmente abiertos y detectar deterioro temprano sin mantener snapshots diarios de estado.

---

# 6. Marts / cubos

Los cubos no son la fuente de verdad. Son una capa semántica/materializada para servir consultas rápidas sobre hechos y métricas certificadas.

No se construye un cubo por motor.

V0.1 prevé pocos cubos por dominio factual, por ejemplo:

- `cube_comercial`
- `cube_flujo`
- `cube_stock`
- `cube_mercado`

Varios motores pueden consumir el mismo cubo y la misma métrica.

Los cubos deben ser reemplazables sin alterar el significado de los hechos canónicos.

---

# 7. Motores analíticos V0.1

Las 8 familias objetivo son:

1. expectativa / cierre;
2. construcción del resultado;
3. salud / deterioro;
4. mercado;
5. explicación;
6. desempeño relativo;
7. adecuación producto × lugar × venta;
8. flujo operacional.

Distinción central:

> #1 dice cuánto falta. #5 dice por qué falta. #8 dice dónde está trabado.

Los motores consumen métricas y cubos compartidos. No poseen su propia definición de venta, stock, aging, persona, producto o sucursal.

---

# 8. Responsabilidad por capa

```text
RAW
= conserva evidencia

DIMENSIONES
= resuelven quién / qué es

HECHOS CANÓNICOS
= representan qué ocurrió o cuál es el estado operacional actual

MÉTRICAS CERTIFICADAS
= fijan cómo se mide

MARTS / CUBOS
= optimizan cómo se consulta

MOTORES
= ejecutan análisis determinísticos por familia

LLM
= interpreta, explica y conversa
```

---

# 9. Decisiones V0.1 congeladas

1. Los cubos no son la fuente de verdad analítica.
2. Los hechos canónicos y sus grains deben permanecer estables.
3. `vehiculo_canonico` tiene grain VIN actual.
4. `fact_operacion` tiene grain unidad dentro de proceso comercial, no NV.
5. `fact_venta` tiene grain unidad vendida, no operación ni factura.
6. Toda métrica de unidades parte desde grain unidad.
7. Las dimensiones de producto, sucursal, persona, dealer y tiempo son conformadas y compartidas.
8. Las métricas básicas se certifican una sola vez y son reutilizadas por todos los motores.
9. No se crea un cubo por motor; se crean cubos por dominio factual cuando agreguen eficiencia.
10. V0.1 no persiste snapshots históricos de estados de vehículo por defecto; la historia se reconstruye desde hitos temporales cuando la fuente los contiene.

---

# 10. Próximo nivel de diseño

Antes de crear tablas físicas de hechos, cada contrato deberá fijar:

- PK técnica;
- clave natural/canónica;
- FK a dimensiones conformadas;
- campos fuente necesarios;
- deduplicación;
- reconciliación entre RAWs;
- reglas de exclusión;
- métricas que puede soportar;
- validaciones de integridad.

El diseño físico debe derivar de estos grains y no redefinirlos.
