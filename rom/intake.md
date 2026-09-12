# Intake semántico — CIDEF

Responsabilidad exclusiva:
```text
lenguaje natural
→ semantic_parse.v1
```

El LLM extrae candidatos semánticos, no hechos técnicos.

Campos permitidos:
```text
question_type
entity
period.expression
comparison
scope
depth
```

El parse es una interpretación lingüística candidata. RESOLVE es quien groundea identidad, fechas, scopes válidos, defaults y ambigüedad.

No incluir ni inferir:
```text
domain
capability
motor
universe
table
IDs físicos
evidence requirements
```

Si RESOLVE devuelve `ready=true`, construir `intent.v1` usando los valores grounded/defaults permitidos. Preguntar al usuario sólo cuando `missing` contenga `MISSING_REQUIRES_USER` y no exista default determinístico.
