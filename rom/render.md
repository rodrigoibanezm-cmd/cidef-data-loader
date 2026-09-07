# Render de discovery — CIDEF

```text
PHASE = DISCOVERY
OUTPUT_AUDIENCE = LLM
```

Objetivo: entregar a otro LLM la mínima información suficiente para continuar correctamente una investigación, validación o diseño.

## Prioridad
```text
evidencia → decisión/regla → excepción/incertidumbre → siguiente prueba
```

Optimizar para densidad, precisión, trazabilidad y reproducibilidad; no para narrativa o presentación ejecutiva.

## Bloques
Usar sólo los necesarios:
`DECISION`, `EVIDENCE`, `RULE`, `RESULT`, `EXCEPTION`, `UNKNOWN`, `RISK`, `BLOCKER`, `NEXT_TEST`, `VERDICT`.

Cuando sea material, distinguir:
- `OBSERVED`: evidencia directa;
- `CALCULATED`: derivación determinista;
- `SUPPORTED`: conclusión respaldada;
- `HYPOTHESIS`: pendiente de prueba;
- `CLOSED`: no reabrir sin contradicción;
- `UNKNOWN`: evidencia insuficiente.

## Auditoría
- Reportar sólo lo literalmente observable en la traza disponible.
- No inferir requests, responses, flags, estados ni decisiones ausentes.
- Si algo no está preservado o no fue explícito, usar `NOT_AVAILABLE`, `NOT_EXPLICIT` o `UNKNOWN`.
- No reconstruir contenido ausente desde resultados posteriores ni desde la respuesta producida.

## Experimentos
Formato preferido cuando aplique:
`QUESTION → INPUT → METHOD → RESULT → VALIDATION → WARNINGS → INTERPRETATION → NEXT_TEST`.

`METHOD` debe permitir reproducir, no enseñar. Separar evidencia de inferencia.

## Diseño de capacidad
Cuando corresponda:
`ENGINE → QUESTION → INPUT → DEPENDENCIES → CALCULATION → OUTPUT → COVERAGE → WARNINGS → VALIDATION → OPEN_QUESTIONS → STATUS`.

No repetir arquitectura cerrada ni contexto que no cambie el contrato.

## Estilo
Preferir tablas compactas, fórmulas, estados, conteos, cobertura, contradicciones y blockers.

Evitar introducciones, recapitulaciones, persuasión, pedagogía, ejemplos redundantes y párrafos largos.

Si la evidencia no soporta una hipótesis, decirlo; no buscar una lectura alternativa para producir una conclusión positiva.

Agregar detalle sólo si cambia una decisión, explica una contradicción, permite reproducir o identifica un riesgo material.

El cambio entre discovery y producción cambia presentación, no lógica analítica ni cálculos.
