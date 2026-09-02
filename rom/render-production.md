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

## Formato obligatorio

### Título

- Un solo título principal.
- Debe describir directamente la respuesta o período analizado.

### Secciones

Cada sección relevante debe tener:

```text
emoji + título corto
3 a 5 bullets
lectura breve opcional
```

Reglas:

- 1 bullet = 1 idea.
- Preferir bullets de una línea.
- Máximo dos líneas cuando el dato requiera contexto indispensable.
- Máximo 5 bullets por sección salvo que el usuario pida detalle.
- Máximo 6 hallazgos en una lectura ejecutiva.
- No crear una sección si no contiene una conclusión útil.
- No repetir el mismo hallazgo en varias secciones.

---

## Densidad

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
- convertir cada métrica en un párrafo.

### PREFERIDO

- bullets cortos;
- cifras concretas;
- comparaciones;
- deltas;
- porcentajes y puntos porcentuales correctamente diferenciados;
- tablas compactas cuando comparan mejor que prosa;
- negrita para el dato o conclusión material;
- una lectura explícita cuando la evidencia permite interpretación.

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
- inferencia sustentada → introducir como `Lectura:`;
- evidencia insuficiente → decirlo brevemente y continuar.

No inventar causalidad.

---

## Comparaciones

Cuando existan 2 o más dimensiones comparables, preferir tabla compacta.

Ejemplo:

```text
| Indicador | Industria | CIDEF |
|---|---:|---:|
| Crecimiento YoY | +8,1% | +17,6% |
| Diferencial | — | +9,5 pp |
```

Después de la tabla, máximo una línea de lectura.

No duplicar en bullets todos los números ya visibles en la tabla.

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

Cuando exista evidencia suficiente, expresar:

```text
QUÉ REQUIERE ATENCIÓN
SEÑAL
MAGNITUD
POR QUÉ IMPORTA
```

Ejemplo:

```text
- **Tienda X:** share relativo **-4,2 pp** vs baseline y estado `DETERIORATING`.
  **Lectura:** el resultado absoluto todavía oculta una trayectoria adversa.
```

Evitar planes de acción genéricos como `hacer seguimiento`, `mejorar gestión` o `revisar estrategia` si no provienen de evidencia.

---

## Respuestas de cierre mensual

Cuando la intención sea cierre mensual, usar preferentemente:

```text
# Cierre [MES]

### 📌 Lectura ejecutiva
3–6 hallazgos

### 📈 Resultado y mercado
comparación compacta

### 🧩 Qué sostuvo el resultado
estructura relevante

### ⚠️ Señales que merecen atención
sólo señales materiales

### 🎯 Qué mirar ahora
máximo 3–5 situaciones
```

Agregar otras secciones sólo si contienen evidencia material.

No forzar una estructura fija si el contenido no la justifica.

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

Preferir:

```text
CIDEF creció 9,5 pp por sobre la industria.
```

sobre:

```text
Al observar comparativamente la evolución interanual de ambas series, se aprecia que CIDEF presenta una tasa de crecimiento superior a la registrada por la industria.
```

---

## Criterio final

Antes de entregar una respuesta PRODUCTION comprobar:

```text
¿Se entiende la conclusión principal en menos de 15 segundos?
¿Los números importantes están visibles sin leer párrafos?
¿Cada bullet agrega una idea distinta?
¿Hay algo que pueda eliminarse sin perder información útil?
```

Si la última respuesta es sí, eliminarlo.
