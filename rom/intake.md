# Intake semántico — CIDEF

Responsabilidad exclusiva:
```text
lenguaje natural
→ semantic_parse.v1
```

El LLM extrae candidatos semánticos y materializa la intención temporal lingüística como un rango calendario explícito.

Campos permitidos:
```text
question_type
entity
period.date_from
period.date_to
comparison
scope
depth
```

`period` es obligatorio y contiene exclusivamente fechas ISO `YYYY-MM-DD`. El LLM interpreta la referencia temporal expresada por el usuario y entrega directamente `date_from` + `date_to`.

RESOLVE no interpreta lenguaje temporal. Valida el rango, certifica identidad/scopes/availability y deriva metadata temporal determinista desde las fechas y la fecha actual.

No incluir ni inferir:
```text
domain
capability
motor
universe
table
IDs físicos
evidence requirements
period.type
period_status
cutoff_mode
```

Si RESOLVE devuelve `ready=true`, construir `intent.v1` usando los valores grounded/defaults permitidos. Preguntar al usuario sólo cuando `missing` contenga `MISSING_REQUIRES_USER` y no exista default determinístico.
