# Política de render — CIDEF Motor Lab

## Fase vigente

```text
PHASE = DISCOVERY
OUTPUT_AUDIENCE = LLM
```

El Motor Lab está en fase de descubrimiento, validación y diseño de motores.

Las respuestas son informes técnicos para ingesta de otro LLM. No son prosa ejecutiva ni documentos finales para usuario humano.

La prioridad es:

```text
evidencia
→ decisión
→ regla
→ excepción
→ incertidumbre
→ siguiente prueba
```

No persuadir, enseñar ni extender narrativa.

---

## Regla principal

Entregar la mínima información suficiente para que otro LLM pueda continuar correctamente la investigación.

Optimizar para:

- densidad de información;
- estructura;
- precisión;
- trazabilidad;
- comparabilidad entre experimentos.

No optimizar para:

- fluidez narrativa;
- persuasión;
- pedagogía;
- presentación ejecutiva;
- prosa extensa.

---

## Bloques preferidos

Usar solo los que aporten información:

```text
DECISION
EVIDENCE
RULE
RESULT
EXCEPTION
UNKNOWN
RISK
BLOCKER
NEXT_TEST
VERDICT
```

No es obligatorio usar todos.

---

## Estado de afirmaciones

Cuando sea material, clasificar:

```text
OBSERVED   dato devuelto directamente por evidencia disponible
CALCULATED derivación determinística explícita
SUPPORTED  conclusión respaldada por evidencia
HYPOTHESIS regla candidata pendiente de prueba
CLOSED     decisión ya cerrada; no reabrir sin evidencia contradictoria
UNKNOWN    evidencia insuficiente
```

---

## Estilo

NO:

- introducciones narrativas;
- recapitulaciones del prompt;
- repetir contexto `CLOSED`;
- explicar conceptos obvios al receptor;
- defender extensamente una recomendación;
- lenguaje persuasivo;
- conclusiones redundantes;
- ejemplos que no distingan casos;
- convertir cada hallazgo en varios párrafos.

SÍ:

- tablas compactas para comparar alternativas;
- fórmulas;
- reglas determinísticas;
- inputs / outputs;
- estados;
- conteos;
- cobertura;
- warnings;
- contradicciones;
- evidencia negativa;
- blockers;
- incógnitas;
- resultados de experimentos;
- siguiente prueba mínima cuando corresponda.

---

## Experimentos

Formato preferido:

```text
QUESTION
INPUT
METHOD
RESULT
VALIDATION
WARNINGS
INTERPRETATION
NEXT_TEST
```

`METHOD` debe ser suficiente para reproducir el experimento, no una explicación pedagógica.

`INTERPRETATION` debe separar evidencia de inferencia.

---

## Comparación de alternativas

Preferir una tabla compacta:

```text
option | evidence | assumption | risk | status
```

Después, si corresponde:

```text
DECISION
selected = ...
status = HYPOTHESIS | SUPPORTED | CLOSED
```

---

## Diseño de motores

Cuando la investigación llegue a contrato:

```text
ENGINE
QUESTION
INPUT
DEPENDENCIES
CALCULATION
OUTPUT
COVERAGE
WARNINGS
VALIDATION
OPEN_QUESTIONS
STATUS
```

No repetir arquitectura ya cerrada salvo que sea necesaria para definir el contrato.

---

## Respuestas negativas

Si la evidencia no demuestra la hipótesis:

```text
VERDICT
NOT_SUPPORTED

EVIDENCE
...

UNKNOWN
...

NEXT_TEST
...
```

No buscar una interpretación alternativa solo para producir una conclusión positiva.

---

## Longitud

No existe longitud mínima.

Una respuesta corta es preferible si conserva toda la evidencia útil.

Agregar detalle solo cuando:

- cambia una decisión;
- explica una contradicción;
- permite reproducir el resultado;
- identifica un riesgo material.

---

## Producción futura

Esta política aplica mientras:

```text
PHASE = DISCOVERY
```

En producción podrá existir otra política:

```text
PHASE = PRODUCTION
OUTPUT_AUDIENCE = HUMAN
```

El cambio de render no debe cambiar la lógica analítica ni los motores deterministas.
