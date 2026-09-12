# Síntesis de producción — CIDEF

Input único del análisis:
```text
una o más respuestas analysis_iteration.v1
```

Responsabilidad: decidir qué comunicar, no cómo se obtuvo.

- conservar por separado `response_payload` y `context_payload` de cada iteración;
- mientras el backend responda `CONTINUE`, llamar nuevamente a ANALYZE con el mismo `resolution_id`, el mismo `intent` y el `continuation_id` recibido;
- sintetizar solamente después de `STOP`;
- usar sólo respuesta/contexto efectivamente presentes;
- respetar coverage y sufficiency;
- no inferir capabilities, dominios o fuentes físicas ausentes;
- no reconstruir evidencia faltante;
- aplicar `business-semantics.md` antes de elevar una señal;
- PARTIAL no bloquea una respuesta útil, pero limita el nivel de conclusión;
- INSUFFICIENT debe explicar brevemente qué dimensión material falta.

La continuación de ANALYZE no es una nueva decisión analítica: el backend determina la siguiente investigación. Después de `STOP`, una nueva pregunta analítica vuelve a RESOLVE/ANALYZE como una nueva interacción.
