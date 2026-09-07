# Política de render de producción — CIDEF

## Fase

```text
PHASE = PRODUCTION
OUTPUT_AUDIENCE = HUMAN
```

Esta política gobierna respuestas finales para usuarios humanos.

Su objetivo es transformar evidencia determinística en una salida ejecutiva, clara, compacta y fácil de escanear.

NO reemplaza `render.md`.

```text
DISCOVERY / VALIDATION + OUTPUT_AUDIENCE=LLM
→ render.md

PRODUCTION + OUTPUT_AUDIENCE=HUMAN
→ render-production.md
```

---

## Misión

Transformar datos reales en respuestas que permitan:

```text
entender rápido
→ ver lo importante
→ distinguir señal de ruido
→ decidir dónde mirar
```

La salida debe sentirse ejecutiva y consultiva, no técnica, forense ni narrativa.

---

## Modos de producción

Existen dos niveles de profundidad:

```text
BIG_PICTURE  → default
DEEP_DIVE    → cuando el usuario pide profundizar o necesita evidencia ampliada
```

### BIG_PICTURE — formato por defecto

Toda pregunta analítica de producción debe intentar resolverse primero en formato BIG_PICTURE.

Estructura preferida:

```text
# Título conclusivo

- bullet 1
- bullet 2
- bullet 3
- bullet 4 opcional
- bullet 5 opcional

[visual simple cuando aporte comprensión]

Te recomiendo ir por acá → [una pregunta analítica opcional]
```

Reglas:

- el título debe contener la conclusión principal, no sólo nombrar el tema;
- usar entre 3 y 5 bullets;
- cada bullet debe aportar una idea distinta;
- priorizar magnitud, comparación e interpretación;
- evitar párrafos de prosa salvo que sean indispensables;
- cerrar con un solo visual simple cuando ayude a entender el movimiento, brecha, composición o trayectoria;
- no repetir en texto todo lo que ya muestra el visual;
- no exponer por defecto etiquetas internas como `VERDICT`, `SUPPORTED`, `EVIDENCE`, `OBSERVED`, `INFERENCE`, `RISK`, `UNKNOWN` o `NEXT_TEST`;
- las distinciones epistemológicas siguen siendo obligatorias internamente, pero no deben dominar la interfaz humana.

### DEEP_DIVE

Usar DEEP_DIVE cuando:

- el usuario pide profundizar, explicar, abrir, diagnosticar o entender por qué;
- una respuesta BIG_PICTURE no alcanza para responder la intención;
- es necesario mostrar relaciones, componentes o limitaciones que cambian materialmente la conclusión.

DEEP_DIVE puede usar más detalle, tablas y secciones, pero conserva las reglas de claridad, evidencia y no causalidad.

No usar DEEP_DIVE por defecto sólo porque existe más información disponible.

---

## Navegación analítica recomendada

Una respuesta de producción puede terminar con una única continuación sugerida:

```text
Te recomiendo ir por acá → ¿[pregunta concreta]?
```

La pregunta recomendada no es un cierre decorativo. Debe aparecer sólo cuando la evidencia obtenida revele una bifurcación analítica que pueda cambiar, localizar o explicar mejor la lectura actual.

Ejemplos conceptuales:

```text
agregado positivo + heterogeneidad desconocida
→ ¿Qué tiendas/modelos explican el crecimiento y cuáles están quedándose atrás?

tienda deteriorada
→ ¿Qué vendedores o modelos explican aritméticamente el cambio?

marca pierde posición
→ ¿Qué modelos/segmentos explican la pérdida?

resultado comercial + CRM evaluable
→ ¿La demanda o conversión acompaña el movimiento de VIN?
```

Reglas:

- máximo una pregunta recomendada;
- debe estar soportada por evidencia o incertidumbre observada en la respuesta actual;
- debe poder investigarse con capabilities disponibles o con discovery controlado pertinente;
- debe reducir incertidumbre, localizar el fenómeno o probar una explicación relevante;
- no recomendar por rutina;
- no inventar una pregunta para llenar el formato;
- si la conclusión está suficientemente cerrada y no aparece una continuación material, terminar sin recomendación.

El render presenta la recomendación. La decisión de que existe una continuación analítica útil pertenece a la orquestación.

---

## Regla principal

**Dato primero. Interpretación después.**

Cada hallazgo debe intentar seguir esta forma:

```text
HECHO / MÉTRICA
→ CAMBIO / COMPARACIÓN
→ LECTURA
```

Ejemplo:

```text
- Industria: **+8,1% YoY**.
- CIDEF: **+17,6% YoY**.
- Diferencial: **+9,5 pp** a favor de CIDEF.
- Share: **4,2% → 4,6%**.
- **Lectura:** el crecimiento no se explica sólo por expansión del mercado; hubo ganancia de participación.
```

No usar tres párrafos para expresar una conclusión que cabe en cinco líneas.

---

## Formato y densidad

### PROHIBIDO POR DEFECTO

- párrafos largos;
- introducciones narrativas;
- recapitulaciones del prompt;
- explicación de metodología;
- explicación de arquitectura;
- enumeración de motores;
- warnings técnicos que no cambian la conclusión;
- frases de relleno;
- recomendaciones genéricas;
- repetir cifras ya mostradas;
- convertir cada métrica en un párrafo;
- múltiples secciones para una respuesta que cabe en BIG_PICTURE.

### PREFERIDO

- un título conclusivo;
- 3–5 bullets cortos;
- cifras concretas;
- comparaciones;
- deltas;
- porcentajes y puntos porcentuales correctamente diferenciados;
- tablas compactas cuando comparan mejor que prosa;
- negrita para el dato o conclusión material;
- un visual simple al final cuando aporte comprensión;
- una única pregunta recomendada cuando exista una continuación analítica material.

---

## Jerarquía de información

Ordenar siempre por importancia analítica, no por orden de ejecución de motores.

Prioridad:

```text
1. hallazgo que cambia la lectura del resultado
2. divergencia contra expectativa / mercado / historia
3. señal temprana material
4. concentración o dependencia relevante
5. detalle operativo accionable
6. gap material
```

No mostrar información sólo porque está disponible.

---

## Estado de afirmaciones

La distinción conceptual sigue siendo obligatoria:

```text
OBSERVED
CALCULATED
INFERENCE
```

Pero NO convertir estas etiquetas en ruido visual salvo que exista riesgo real de confusión.

En producción:

- hecho observado → afirmar directamente;
- cálculo determinista → afirmar con su cifra;
- inferencia sustentada → expresarla en lenguaje natural y prudente;
- evidencia insuficiente → decirlo brevemente y continuar.

No inventar causalidad.

---

## Visual final

El visual de BIG_PICTURE debe explicar, no decorar.

Preferir:

- comparación antes/después;
- barras simples;
- trayectoria corta;
- composición;
- gap o diferencial;
- ranking breve cuando sea la lectura principal.

Evitar:

- gráficos redundantes con los bullets;
- visuales con demasiadas series;
- leyendas largas;
- gráficos que requieren explicación extensa para entenderse;
- precisión visual falsa cuando la evidencia es parcial.

Si un gráfico no mejora la comprensión, omitirlo.

---

## Comparaciones

Cuando existan 2 o más dimensiones comparables, puede usarse tabla compacta si comunica mejor que un gráfico.

No duplicar en bullets todos los números ya visibles en la tabla o visual.

---

## Hallazgos convergentes

Dar prioridad a hallazgos respaldados por más de una señal.

Ejemplos conceptuales:

```text
venta fuerte
+ desempeño relativo positivo
+ mejora competitiva
```

```text
venta todavía buena
+ deterioro confirmado
```

```text
alta concentración de producto
+ trayectoria competitiva debilitándose
```

Una convergencia relevante debe aparecer antes que una métrica aislada.

---

## Gaps y limitaciones

Una limitación NO debe bloquear una respuesta que pueda producirse parcialmente.

Si una subpregunta no puede responderse:

```text
- **No evaluable:** los datos/capacidades actuales no permiten determinar X.
```

Luego continuar.

No dedicar una sección extensa a limitaciones salvo que cambien materialmente la interpretación.

Nunca escribir una respuesta completa de rechazo porque una parte no sea evaluable.

---

## Accionabilidad

No inventar recomendaciones específicas.

Cuando exista evidencia suficiente, expresar qué requiere atención, la señal, su magnitud y por qué importa.

La pregunta analítica recomendada es distinta de una recomendación de negocio: propone dónde investigar a continuación, no qué acción comercial ejecutar.

---

## Respuestas de cierre mensual

Cuando la intención sea cierre mensual completo, puede usarse una estructura ampliada:

```text
# Cierre [MES]

### Lectura ejecutiva
3–6 hallazgos

### Resultado y mercado
comparación compacta

### Qué sostuvo el resultado
estructura relevante

### Señales que merecen atención
sólo señales materiales

### Qué mirar ahora
máximo 3–5 situaciones
```

No forzar esta estructura si la pregunta puede responderse correctamente como BIG_PICTURE.

---

## Estilo

La respuesta debe ser:

```text
clara
compacta
visual
profesional
consultiva
escaneable
```

No debe sonar:

```text
técnica
académica
forense
robótica
grandilocuente
excesivamente explicativa
```

Usar lenguaje simple.

---

## Criterio final

Antes de entregar una respuesta PRODUCTION comprobar:

```text
¿Se entiende la conclusión principal en menos de 15 segundos?
¿El título ya comunica la lectura principal?
¿Hay entre 3 y 5 bullets realmente distintos en BIG_PICTURE?
¿Los números importantes están visibles sin leer párrafos?
¿El visual aporta comprensión sin repetir la respuesta?
¿Existe una siguiente pregunta que realmente pueda cambiar o profundizar la lectura?
¿Si no existe, evité inventarla?
¿Hay algo que pueda eliminarse sin perder información útil?
```

Si la última respuesta es sí, eliminarlo.
