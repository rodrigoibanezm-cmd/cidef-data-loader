# ROM Motors

## AVAILABLE

### `vin_growth_diagnostic_v01`

**VERSION**: `0.1`

**QUESTION**: ¿Cómo debe interpretarse el crecimiento o deterioro observado de VIN de una tienda CIDEF para una marca, considerando simultáneamente la evolución de la marca en RVM, la posición relativa de esa tienda dentro de CIDEF y el contexto comercial observable en CRM?

**GRAIN**: `MONTH × OWN_STORE × BRAND`

**COMMERCIAL UNIVERSE**: fijo `OWN_STORES`; no es configurable.

**PUBLIC INPUT**:

```json
{
  "brand_id": 71,
  "store_id": 7,
  "current_month": "2026-08"
}
```

Sólo acepta `brand_id`, `store_id`, `current_month`. `previous_month` se deriva como el mes calendario inmediatamente anterior.

**DEPENDENCIES**:
- `ventas_longitudinal_context_v01`
- `rvm_longitudinal_context_v01`
- `crm_longitudinal_context_v01`
- canonical BRAND / STORE resolution
- certified `OWN_STORES` commercial scope and VENTAS ↔ CRM compatibility

**STORE RESULT**: VIN de la tienda para la marca en `t` y `t-1`, delta, delta porcentual, `Direction` y `ActivityTransition`. Base anterior cero produce porcentaje `null` con `NOT_EVALUABLE_ZERO_BASE`.

**RVM CONTEXT**: sólo VIN contemporáneo de la marca en RVM. Entrega VIN `t`, VIN `t-1`, delta, delta porcentual y dirección. No contiene competitive share, rank ni competitive universe.

**INTERNAL POSITION**: se calcula exclusivamente como `store_brand_vin / total_own_stores_brand_vin`, usando la misma evidencia VENTAS, misma marca, mismo mes y mismo universo `OWN_STORES`. Denominador cero produce share `null`, `evaluable=false` y dirección `NOT_EVALUABLE`.

**CRM CONTEXT**: sólo `CONVERSION_RATE` y `SOLD` bajo `OWN_STORES`. La conversión reutiliza exactamente numerator, denominator y value ya expuestos por `crm_longitudinal_context_v01`; no reconstruye la métrica. `CRM_NO_HISTORICAL_STATE_SNAPSHOTS` se preserva como limitación cuando aplica.

**DETERMINISTIC CALCULATIONS**:
- `delta = current - previous`
- `pct = ((current - previous) / previous) * 100` sólo cuando `previous > 0`
- `Direction = POSITIVE | NEGATIVE | FLAT | NOT_EVALUABLE`
- `PctStatus = EVALUABLE | NOT_EVALUABLE_ZERO_BASE | NOT_EVALUABLE_SOURCE`
- `ActivityTransition = NEW_ACTIVITY | CEASED_ACTIVITY | CONTINUING_ACTIVITY | NO_ACTIVITY`
- `DiagnosticRelation = SAME_DIRECTION | OPPOSITE_DIRECTION | STORE_MOVED_CONTEXT_FLAT | STORE_FLAT_CONTEXT_MOVED | BOTH_FLAT | NOT_EVALUABLE`

**COMPLETE / PARTIAL**:
- `COMPLETE`: STORE core evaluable y RVM, internal share, CRM conversion y CRM SOLD evaluables.
- `PARTIAL`: STORE core evaluable y al menos un contexto auxiliar no evaluable.
- Missing/no coverage nunca se transforma en cero. Ceros certificados se preservan como cero.

**RECONCILIATIONS**:
- todos los deltas reconcilian `current - previous`
- internal share reconcilia numerator / denominator
- CRM conversion reconcilia numerator / denominator cuando denominator > 0
- CRM numerator no puede exceder denominator
- store VIN no puede exceder total own-store brand VIN
- internal share evaluable debe pertenecer a `[0,1]`
- direction es el signo exacto del delta
- diagnostic relation sigue la tabla exacta de pares de direcciones

**LIMITATIONS / OUT OF SCOPE V0**:
- sin competitive share/rank/universe
- sin seller ni model analysis
- sin CRM lead, coverage o lag predictor
- sin causal attribution
- sin health/risk/opportunity classification
- sin thresholds, scores, materiality o Pareto
- sin narrativa ni recomendaciones

## NOT AVAILABLE

No se agregan capacidades adicionales en esta implementación.
