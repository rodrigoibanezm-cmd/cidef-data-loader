# Intake analítico

## Responsabilidad

Transformar una pregunta natural en un **plan mínimo de evidencia** y, desde ese plan, construir **llamadas semánticas eficientes**.

```text
pregunta natural
→ requisitos de evidencia
→ límites y población
→ slicing mínimo
→ llamadas/payloads
```

El intake decide **qué evidencia pedir y en qué orden**. No redacta la respuesta final, no redefine reglas de negocio y no sustituye los contratos de `vin-cube.md`, `motors.md` ni `catalog.md`.

## Regla principal

> Pedir siempre la menor evidencia suficiente para responder la pregunta.

Antes de cada llamada, determinar:

1. qué hecho concreto debe resolver;
2. qué motor puede producirlo;
3. qué universo o población necesita;
4. qué período necesita;
5. qué dimensiones, medidas y filtros son estrictamente necesarios;
6. cuál es la cardinalidad conceptual esperada;
7. si una llamada previa más pequeña permite reducir la siguiente.

Una llamada sin una función analítica clara no debe ejecutarse.

---

## 1. Routing

### A. VIN

Usar `vin_olap` cuando la pregunta sea expresable de forma segura por `VIN_SEMANTIC_CUBE_V0.1`.

Traducir únicamente los elementos necesarios de la pregunta a:

- `operation`;
- `universe`;
- `measures`;
- `dimensions`;
- `time.role`;
- `time.grain`;
- `time.from/to`;
- `filters`;
- `derived_metrics`;
- `options`.

Validar nombres, niveles, eventos y restricciones contra `vin-cube.md`.

No reconstruir mediante motores generales una consulta que el cubo puede expresar directamente.

### B. Motores generales

Usar `table_schema`, `profile_table`, `query_table` o `join_tables` cuando:

- falta descubrir estructura;
- la fuente requerida está fuera del cubo VIN;
- la pregunta corresponde a RVM;
- se necesita un join no cubierto por el cubo;
- falta validar valores, llaves o cardinalidad.

Consultar `catalog.md` para las tablas permitidas y `motors.md` para las capacidades disponibles.

No inventar tablas, columnas, mappings ni capacidades.

---

## 2. Descomposición mínima

Antes de construir payloads, extraer de la pregunta:

```text
objetivo:
población:
métrica:
dimensiones:
condiciones:
ventana temporal:
extremos temporales conocidos/desconocidos:
granularidad:
zero-fill requerido:
ranking/postproceso:
```

Distinguir entre:

- **evidencia necesaria para resolver límites o población**;
- **evidencia principal para calcular el resultado**;
- **operaciones determinísticas posteriores** que no requieren traer más datos.

No incluir en una llamada dimensiones, métricas o períodos solo porque estén disponibles.

---

## 3. Temporalidad

Las restricciones temporales se resuelven **antes de solicitar series**.

Si la pregunta contiene o implica una ventana acotada, por ejemplo:

- últimos N meses;
- último mes;
- año actual;
- período anterior;
- desde X hasta Y;
- N períodos anteriores a un extremo;

el intake debe determinar `from/to` antes de ejecutar la consulta temporal principal.

### Extremo temporal conocido

Calcular directamente `from/to` según la semántica de la pregunta y solicitar solo ese intervalo.

### Extremo temporal desconocido

Si la ventana depende de un extremo que debe descubrirse en los datos, usar primero `vin_olap` con:

```text
operation = TEMPORAL_BOUNDARY
boundary  = MIN | MAX
```

y definir únicamente:

- el `universe` mínimo correcto;
- `time.role`;
- `time.grain`;
- filtros semánticos que realmente condicionen el extremo.

Ejemplo para descubrir el último mes con evento `NV`:

```text
operation      = TEMPORAL_BOUNDARY
universe.type  = EVENT_POPULATION
universe.event = NV
time.role      = NV
time.grain     = month
boundary       = MAX
```

La respuesta de `TEMPORAL_BOUNDARY` se usa únicamente para resolver el límite temporal. No pedir una serie histórica para descubrir un extremo.

### Último período disponible vs último período completo

No confundir:

```text
latest_available_period
last_complete_period
```

`TEMPORAL_BOUNDARY MAX` devuelve el último período **con datos**, no certifica que ese período esté completo.

Cuando la pregunta pida el último mes calendario completo:

1. resolver `MAX` con `grain=month`;
2. comparar ese mes con el mes calendario actual;
3. si `MAX` es anterior al mes actual, usar `MAX`;
4. si `MAX` coincide con el mes actual, usar el mes calendario anterior;
5. si una regla de negocio define otra noción de “completo”, aplicar esa regla en lugar de asumirla.

La misma distinción aplica a otros grains cuando corresponda.

### Regla dura

> **Nunca ejecutar una serie temporal abierta si la pregunta define o permite resolver una ventana temporal acotada.**

La ausencia de `from/to` en una consulta temporal `AGGREGATE` debe estar justificada por la pregunta. No debe ocurrir por conveniencia del agente.

---

## 4. Filtrado y población

Aplicar el orden:

```text
resolver límites
→ definir población
→ acotar tiempo
→ filtrar
→ agrupar
→ postprocesar
```

Cuando una condición permite reducir la población antes de una consulta amplia, considerar resolverla mediante una llamada pequeña y usar el resultado para acotar la llamada posterior.

No pedir historia completa para después descartar la mayor parte localmente.

No traer VIN individuales cuando basta una agregación.

---

## 5. Cardinalidad y payload

Antes de ejecutar una consulta potencialmente amplia, estimar conceptualmente su cardinalidad.

Para una agregación multidimensional considerar, como mínimo:

```text
categorías dimensión 1
× categorías dimensión 2
× ...
× períodos
≈ grupos potenciales
```

No es necesario conocer cardinalidades exactas si basta identificar que el slice está sobredimensionado.

Si la cardinalidad puede crecer innecesariamente, aplicar en este orden:

1. reducir la ventana temporal;
2. eliminar dimensiones innecesarias;
3. reducir la población mediante filtros;
4. separar el problema en llamadas pequeñas con funciones distintas;
5. paginar solo si el slice mínimo sigue requiriéndolo.

### Límites

`limit` controla la cantidad devuelta; **no define correctamente el problema analítico**.

> No usar `limit=2000` como sustituto de buen slicing.

No aumentar el límite para compensar:

- ausencia de `from/to`;
- dimensiones innecesarias;
- población sin filtrar;
- historia que la pregunta no solicita.

### Paginación

Paginar únicamente cuando:

- el slice ya está correctamente delimitado;
- todas sus filas siguen siendo necesarias;
- el contrato del motor permite recuperar el resultado de forma confiable por páginas.

> No usar paginación para corregir una consulta mal delimitada.

---

## 6. Series temporales

Cuando la pregunta requiere una serie:

- usar el `grain` mínimo necesario;
- solicitar únicamente los períodos relevantes;
- evitar dimensiones adicionales que multipliquen filas sin aportar al cálculo;
- preferir agregaciones a registros individuales.

Si la pregunta solicita N períodos, la consulta principal no debe abarcar más períodos salvo que exista una razón analítica explícita.

---

## 7. Zero-fill

Cuando la pregunta establezca que ausencia de observaciones significa cero para una métrica:

1. identificar la población elegible;
2. fijar una ventana temporal común;
3. recuperar las observaciones de esa población dentro de la ventana;
4. construir conceptualmente `población × períodos`;
5. completar con `0` únicamente las combinaciones ausentes cuya semántica justifique cero;
6. calcular la métrica sobre todos los períodos de la ventana.

> Nunca calcular un promedio únicamente sobre períodos observados cuando la pregunta exige incluir períodos con cero.

El zero-fill es postproceso determinístico si las observaciones recuperadas permiten distinguir de forma segura ausencia de evento de dato inválido o desconocido.

---

## 8. Llamadas secuenciales

Se permiten y prefieren varias llamadas pequeñas cuando reducen el riesgo o el payload total.

Cada llamada debe responder una pregunta intermedia concreta, por ejemplo:

```text
L1: ¿cuál es el extremo temporal?
L2: ¿qué población cumple la condición de elegibilidad?
L3: ¿cuáles son las observaciones necesarias para calcular la métrica?
```

El resultado de una llamada puede determinar filtros o límites de la siguiente.

No repetir `motor + input` sin una nueva razón analítica.

---

## 9. Checklist previo a ejecución

Antes de enviar una llamada, verificar:

- [ ] El motor corresponde a la fuente y semántica.
- [ ] La llamada resuelve una necesidad concreta.
- [ ] El universo es el mínimo correcto.
- [ ] La medida es necesaria.
- [ ] Cada dimensión aporta al resultado.
- [ ] El `grain` es el mínimo necesario.
- [ ] Si falta un extremo temporal resoluble, se usa primero `TEMPORAL_BOUNDARY`.
- [ ] Si existe una ventana temporal resoluble, `from/to` están definidos antes del `AGGREGATE` principal.
- [ ] No se confunde último período disponible con último período completo.
- [ ] No se está solicitando historia innecesaria.
- [ ] La población está filtrada tan pronto como sea posible.
- [ ] La cardinalidad conceptual es razonable.
- [ ] El `limit` no está ocultando un problema de slicing.
- [ ] No se solicitan VIN individuales si basta una agregación.
- [ ] Si hay zero-fill, población y ventana común están explícitas.

Si falla una condición material, rediseñar el slice antes de ejecutar.

---

# Caso de prueba

Pregunta:

> “De los vendedores que tuvieron al menos una venta en el último mes completo disponible, ¿cuáles son los 5 con mayor y los 5 con menor promedio mensual de ventas durante los últimos 6 meses completos? Considera meses con cero ventas dentro del promedio.”

## Intake

```text
objetivo:
ranking top 5 / bottom 5 por promedio mensual

población:
vendedores con >= 1 venta en el último mes completo disponible

métrica:
ventas mensuales

dimensiones:
seller
month

time_role:
NV

ventana:
últimos 6 meses completos terminando en el último mes completo disponible

extremo desconocido:
último mes con datos NV, luego resolver último mes calendario completo

grain:
month

zero-fill:
sí

postproceso:
promedio de 6 meses + ranking
```

La pregunta es expresable mediante el cubo VIN para obtener la evidencia de ventas; usar `vin_olap` conforme a `vin-cube.md`.

## Plan mínimo de evidencia

### L1 — Resolver último mes disponible

Usar exclusivamente:

```text
motor          = vin_olap
operation      = TEMPORAL_BOUNDARY
universe.type  = EVENT_POPULATION
universe.event = NV
time.role      = NV
time.grain     = month
boundary       = MAX
```

No solicitar `seller × month`, VIN individuales, medidas ni una serie temporal.

Resultado conceptual:

```text
latest_available_month = A
```

### C1 — Resolver último mes completo

Sin nueva consulta, comparar `A` con el mes calendario actual.

```text
si A < mes_actual:
  M = A

si A == mes_actual:
  M = mes_anterior
```

`M` es el último mes calendario completo utilizable para este análisis, salvo regla de negocio distinta.

### C2 — Derivar ventana

Calcular determinísticamente:

```text
to   = fin de M
from = inicio del quinto mes anterior a M
```

La ventana contiene exactamente:

```text
M-5, M-4, M-3, M-2, M-1, M
```

### L2 — Identificar población elegible

Consultar exclusivamente el mes `M`:

```text
operation  = AGGREGATE
universe   = EVENT_POPULATION(NV)
time.role  = NV
time.from  = inicio de M
time.to    = fin de M
time.grain = null
dimension  = seller.normalized
measure    = SUM(unit_count)
```

Retener vendedores con al menos una venta.

Resultado conceptual:

```text
eligible_sellers = vendedores activos en M
```

### L3 — Recuperar únicamente la ventana necesaria

Consultar exclusivamente:

```text
operation   = AGGREGATE
universe    = EVENT_POPULATION(NV)
time.role   = NV
from        = inicio de M-5
to          = fin de M
grain       = month
dimension   = seller.normalized
measure     = SUM(unit_count)
población   = eligible_sellers
```

No solicitar meses anteriores a `M-5` ni dimensiones adicionales.

Cardinalidad conceptual máxima del grid requerido:

```text
|eligible_sellers| × 6
```

La respuesta observada puede contener menos grupos porque combinaciones seller × month con cero ventas pueden no materializarse.

### C3 — Zero-fill

Construir determinísticamente:

```text
eligible_sellers × {M-5, M-4, M-3, M-2, M-1, M}
```

Para cada combinación ausente cuya semántica corresponda a ausencia de ventas:

```text
ventas = 0
```

### C4 — Promedio

Para cada vendedor:

```text
promedio_mensual_6m = suma(ventas de los 6 meses) / 6
```

No dividir por el número de meses con observaciones.

### C5 — Ranking

Ordenar por `promedio_mensual_6m` y obtener:

```text
5 mayores
5 menores
```

Resolver empates de forma determinística si es necesario.

---

# Regla aprendida del fallo anterior

El intento fallido pidió `seller × month` con `time.role=NV`, pero sin `from/to`, por lo que solicitó potencialmente todo el histórico y terminó en `ResponseTooLargeError`.

Este intake lo impide porque:

1. un extremo desconocido se resuelve mediante `TEMPORAL_BOUNDARY`;
2. `MAX` se distingue explícitamente de “último período completo”;
3. `from/to` se derivan antes del `AGGREGATE` principal;
4. la población se reduce antes de pedir la serie completa;
5. la consulta principal queda limitada a `eligible_sellers × 6 meses`;
6. `limit` y paginación se evalúan solo después de construir el slice mínimo.

El control de tamaño debe ocurrir **antes de ejecutar**, mediante semántica, temporalidad y filtrado; nunca intentando contener una consulta excesivamente amplia aumentando el límite.