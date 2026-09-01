# VENTAS_PRODUCT_SALES_V0.1

## OBJETIVO

Entregar ventas CIDEF reconocidas por `modelo_id × período` como ingrediente runtime reusable.

No es un motor de crecimiento ni una familia de negocio. Habilita composición posterior con expectativa, mercado y posición competitiva.

## FLUJO

```text
ventas_raw
→ buildVentasContext({ cutoffMonth })
→ recognizedSales
→ identidad PRODUCTO MASTER
→ aggregateProductSales()
→ modelo_id × período
```

## REGLAS

- el cutoff se aplica antes de resolver LAST por VIN;
- producto se resuelve después del reconocimiento de la venta;
- sólo se usan aliases `RESUELTO` de `producto_aliases_v01` asociados a `ventas_raw`;
- no hay fuzzy matching, substring ni inferencia semántica;
- identidad ambigua nunca se eleva a `modelo_id`;
- identidad no resuelta permanece explícita en cobertura;
- `cutoff_month` debe ser igual a `end_month` para preservar lectura point-in-time al cierre del período;
- persistencia exclusivamente runtime.

## ACCIÓN

```text
ventas_product_sales_v01
```

Input:

```json
{
  "modelo_id": 84,
  "start_month": "2025-01",
  "end_month": "2025-07",
  "cutoff_month": "2025-07"
}
```

Output principal:

```text
target:
  modelo_id
  units
  monthly_sales[]
coverage:
  recognized_sales_in_period
  product_resolved
  product_ambiguous
  product_unresolved
  aliases_loaded
  target_aliases
validation:
  ventas_context_ok
  cutoff_context_match
  cutoff_equals_end_month
  target_model_aliases_present
  no_ambiguous_product_identity
  product_identity_complete_in_period
  no_post_cutoff_evidence_used
warnings[]
```

Cobertura histórica incompleta no se completa por inferencia. Se reporta como warning; una identidad ambigua sí invalida una atribución determinística limpia.

## USO INMEDIATO

Repetir el Lab de crecimiento para `modelo_id=84`:

```text
ene-jul 2025 → ventas_product_sales_v01
ene-jul 2026 → ventas_product_sales_v01
```

Si la cobertura del target es adecuada, consumir luego `competitive_context_v01` para los mismos períodos y evaluar descomposición mercado/share.
