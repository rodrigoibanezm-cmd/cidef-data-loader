# DECIDE — contrato legible

Este archivo documenta la autoridad ejecutable implementada en `lib/decide/`. No es fuente de verdad ejecutada dinámicamente.

DECIDE recibe `intent.v1` + autoridad firmada por RESOLVE y produce `decision_plan.v1` privado.

Pools públicos semánticos:
- question types: STATUS, PERFORMANCE, CHANGE, EXPECTATION, EXPLANATION, COMPARISON, OPPORTUNITY, RISK, ACTION.
- entity types: COMPANY, STORE, SELLER, BRAND, MODEL.
- comparisons: NONE, YOY, SAME_CUTOFF_YOY, PREVIOUS_PERIOD, EXPECTED, PEERS, MARKET.
- depth: SUMMARY, STANDARD, DEEP.

Familias privadas actuales:
```text
CURRENT_STATUS
EXPECTATION_AND_CLOSE
TEMPORAL_CONSTRUCTION
COMMERCIAL_HEALTH
COMPETITIVE_PERFORMANCE
RESULT_EXPLANATION
FAIR_COMPARISON
OPPORTUNITY_ASSESSMENT
RISK_ASSESSMENT
ACTION_PRIORITIZATION
```

Reglas críticas:
- BRAND/MODEL + PERFORMANCE → COMPETITIVE_PERFORMANCE.
- EXPECTATION requiere CURRENT_MTD.
- SAME_CUTOFF_YOY requiere CURRENT_MTD.
- SELLER no puede usar DEALERS en V0.1.
- Drill-down sólo usa dimensiones autorizadas por `decision_plan.drill_policy`.

Los nombres de capabilities/motores/universos físicos no pertenecen a este documento público-operativo.
