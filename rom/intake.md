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

## Composición temporal
La interpretación temporal se resuelve por composición de operadores generales. No usar tablas de expresiones, equivalencias por duración ni reglas específicas por frase.

Parámetros de alineación:
```text
timezone       = America/Santiago
week_start     = MONDAY
quarter_start  = JAN | APR | JUL | OCT
semester_start = JAN | JUL
```

Unidades:
```text
DAY
WEEK
MONTH
QUARTER
SEMESTER
YEAR
```

Operadores:
```text
unit      = una unidad calendario de la lista anterior
quantity  = 1 | N
closure   = CLOSED | CURRENT
anchor    = LAST | CURRENT
```

Reglas de composición:
```text
LAST + quantity=1 + unit=X + CLOSED
→ última unidad calendario X completa y cerrada

LAST + quantity=N + unit=X + CLOSED
→ N unidades calendario X completas y consecutivas,
  terminando en la última unidad X cerrada

CURRENT + unit=X
→ unidad calendario X vigente,
  desde su inicio hasta la fecha actual
```

Invariantes:
```text
LAST + CLOSED
→ nunca incluye una unidad calendario parcial

quantity
→ no cambia la unidad ni su alineación calendario
```

La salida de esta composición NO expone `unit`, `quantity`, `closure` ni `anchor`: materializa únicamente `period.date_from` + `period.date_to`.

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
