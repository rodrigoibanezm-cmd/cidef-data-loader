# Inventario de routing — CIDEF Agent

Estado: `DESIGN_BASELINE`

Objetivo de este documento:

> Inventariar las actions actualmente registradas en `lib/custom-gpt-router.js` y clasificarlas para la futura capa de routing por dominio, sin modificar todavía motores, contratos ni execution path.

Este documento es respaldo de diseño. La clasificación propuesta aquí no cambia por sí sola la superficie pública vigente.

## Principio de arquitectura

La arquitectura objetivo es:

```text
Custom GPT
│
├─ /api/custom-gpt/sales
├─ /api/custom-gpt/market
├─ /api/custom-gpt/discovery
└─ /api/custom-gpt/longitudinal
          │
          ▼
   custom-gpt-router.js
          │
          ▼
   domain + capability
          │
          ▼
   action física existente
```

Los cuatro endpoints serán fachadas públicas. La autoridad de routing seguirá concentrada en un único router.

El agente no debería seleccionar directamente nombres físicos de motores. La futura selección pública será:

```text
domain + capability -> action física
```

## Clasificaciones

```text
PUBLIC_CAPABILITY
  Capacidad analítica que puede exponerse al agente dentro de un dominio.

DISCOVERY
  Capacidad controlada para explorar tablas y schema.

LONGITUDINAL
  Contexto temporal transversal por dominio.

INTERNAL_SUPPORT
  Motor de auditoría, backtest, resolución, validación, sensibilidad o soporte.
  Sigue existiendo e invocable internamente, pero no debe ser elegible libremente por el LLM.

OUT_OF_CURRENT_SCOPE
  Capacidad existente que no pertenece al perímetro comercial vigente del agente.
```

## Resumen

| Clasificación | Cantidad |
|---|---:|
| `PUBLIC_CAPABILITY / SALES` | 13 |
| `PUBLIC_CAPABILITY / MARKET` | 5 |
| `DISCOVERY` | 4 |
| `LONGITUDINAL` | 3 |
| `INTERNAL_SUPPORT` | 20 |
| `OUT_OF_CURRENT_SCOPE` | 1 |
| **TOTAL** | **46** |

Superficie candidata futura visible al agente: **25 capabilities** distribuidas entre cuatro dominios públicos, en lugar de 46 actions físicas libres.

---

# 1. SALES — PUBLIC_CAPABILITY

Endpoint objetivo:

```text
POST /api/custom-gpt/sales
```

| Capability pública propuesta | Action física actual | Rol |
|---|---|---|
| `MONTHLY_ACTUAL` | `ventas_monthly_actual_v01` | Ventas mensuales observadas |
| `DAILY_CLOSE_FORECAST` | `daily_close_forecast_v01` | Proyección determinística de cierre |
| `CURRENT_MONTH_CLOSE_FORECAST` | `current_month_close_forecast_v01` | Proyección del mes en curso |
| `PREDICTABILITY_DAY` | `predictability_day_v01` | Día desde el cual el cierre adquiere predictibilidad |
| `INTRAMONTH_HISTORY` | `intramonth_sales_history_context_v01` | Historia de construcción intrames |
| `PRODUCT_SALES` | `ventas_product_sales_v01` | Ventas por producto |
| `PRODUCT_DETAIL` | `ventas_product_detail_v01` | Detalle analítico de producto |
| `PRODUCT_CONCENTRATION` | `ventas_product_concentration_v01` | Concentración de ventas por producto |
| `PRODUCT_CHANGE_CONTRIBUTION` | `ventas_product_change_contribution_v01` | Contribución aritmética del producto al cambio |
| `STORE_CHANGE_CONTRIBUTION` | `ventas_store_change_contribution_v01` | Contribución aritmética de tiendas al cambio |
| `SELLER_CHANGE_CONTRIBUTION` | `ventas_seller_change_contribution_v01` | Contribución aritmética de vendedores al cambio |
| `RELATIVE_PERFORMANCE` | `organizational_relative_performance_v01` | Desempeño relativo organizacional |
| `DETERIORATION_STATUS` | `org_sales_deterioration_status_v01` | Estado determinístico de deterioro comercial |

Notas:

- El dominio `SALES` no debe poder invocar capabilities de mercado, discovery o longitudinal.
- Los nombres físicos `ventas_*`, `org_*`, etc. desaparecen del contrato público futuro.
- Contribución aritmética no implica causalidad.

---

# 2. MARKET — PUBLIC_CAPABILITY

Endpoint objetivo:

```text
POST /api/custom-gpt/market
```

| Capability pública propuesta | Action física actual | Rol |
|---|---|---|
| `COMPETITIVE_CONTEXT` | `competitive_context_v01` | Contexto competitivo de un universo RVM |
| `SHARE_TRAJECTORY` | `competitive_share_trajectory_v01` | Trayectoria de participación |
| `COMPETITIVE_RELATION` | `competitive_relation_v01` | Relación observada entre entidades competitivas |
| `INVERSE_SHARE_MOVEMENT` | `competitive_inverse_share_movement_v01` | Movimientos inversos de share con evidencia |
| `MARKET_HISTORY` | `rvm_market_history_v01` | Evolución histórica de un universo RVM |

Notas:

- `competitive_signal_backtest_v01` queda como soporte interno, no como capability pública.
- MARKET no debe resolver preguntas de ventas internas ni CRM salvo que el agente invoque otra fachada explícitamente.

---

# 3. DISCOVERY

Endpoint objetivo:

```text
POST /api/custom-gpt/discovery
```

| Capability pública propuesta | Action física actual | Rol |
|---|---|---|
| `LIST_TABLES` | `list_tables` | Lista de tablas permitidas |
| `TABLE_SCHEMA` | `table_schema` | Schema físico real |
| `PROFILE_TABLE` | `profile_table` | Perfil empírico de tabla/columnas |
| `QUERY_TABLE` | `query_table` | Consulta controlada sin SQL libre |

Notas:

- Discovery permanece disponible porque el agente también cumple función de laboratorio/exploración.
- No se modela como modo exclusivo frente a analytics.

---

# 4. LONGITUDINAL

Endpoint objetivo:

```text
POST /api/custom-gpt/longitudinal
```

| Capability pública propuesta | Action física actual | Rol |
|---|---|---|
| `VENTAS` | `ventas_longitudinal_context_v01` | Contexto longitudinal de ventas |
| `RVM` | `rvm_longitudinal_context_v01` | Contexto longitudinal de mercado |
| `CRM` | `crm_longitudinal_context_v01` | Contexto longitudinal CRM |

Notas:

- `LONGITUDINAL` es transversal: el segundo nivel selecciona el dominio longitudinal concreto.
- Debe preservarse la semántica vigente de `requires_longitudinal_context` durante la transición.
- LONGITUDINAL V0.2 permanece cerrado; esta reorganización no rediseña sus motores.

---

# 5. INTERNAL_SUPPORT

Estas actions siguen siendo parte del sistema determinístico, pero no deberían quedar disponibles para selección libre del LLM en la futura superficie pública.

| Action física | Función de soporte | Motivo para ocultar |
|---|---|---|
| `ventas_monthly_dedup_sensitivity_v01` | Sensibilidad FIRST/LAST | Diagnóstico interno |
| `ventas_cross_month_first_last_audit_v01` | Auditoría FIRST/LAST cross-month | Auditoría interna |
| `ventas_hybrid_unresolved_sensitivity_v01` | Sensibilidad residual de reconocimiento | Diagnóstico interno |
| `ventas_unresolved_recognition_evidence_v01` | Evidencia sobre reconocimiento no resuelto | Auditoría interna |
| `ventas_identity_coverage_v01` | Cobertura de identidad comercial | Habilitante/validación |
| `ventas_daily_context_v01` | Contexto diario base | Soporte de motores superiores |
| `ventas_daily_organizational_context_v01` | Contexto diario organizacional | Soporte de motores superiores |
| `daily_close_backtest_context_v01` | Contexto de backtest de cierre | Backtest |
| `daily_close_forecast_backtest_v01` | Backtest de forecast | Backtest |
| `ventas_product_model_resolution_v01` | Resolución de identidad de modelo | Resolver interno |
| `ventas_organizational_context_v01` | Contexto organizacional base | Habilitante interno |
| `expected_monthly_backtest_v01` | Backtest de expectativa mensual | Backtest |
| `expected_monthly_stability_v01` | Estabilidad de expectativa mensual | Validación |
| `expected_monthly_candidates_v01` | Candidatos para expectativa mensual | Construcción/selección interna |
| `competitive_signal_backtest_v01` | Backtest de señal competitiva | Backtest |
| `product_generation_context_v01` | Contexto de generación por producto | Habilitante interno |
| `organizational_share_expectation_backtest_v01` | Backtest de share esperado organizacional | Backtest |
| `org_sales_deterioration_backtest_v01` | Backtest de deterioro comercial | Backtest |
| `org_sales_deterioration_episode_evidence_v01` | Evidencia de episodios de deterioro | Soporte del estado de deterioro |
| `org_sales_observation_semantics_audit_v01` | Auditoría semántica de observación | Auditoría interna |

Regla objetivo:

> `INTERNAL_SUPPORT` puede ser ejecutado por código, tests, auditorías o workflows internos, pero no debe ser seleccionable directamente por el Custom GPT público.

---

# 6. OUT_OF_CURRENT_SCOPE

| Action física | Estado | Motivo |
|---|---|---|
| `dealer_inventory_aging_v01` | `OUT_OF_CURRENT_SCOPE` | Aging/stock está fuera del perímetro comercial vigente centrado en N de VIN vendidos, posición competitiva y capacidad comercial |

La action no se elimina. Simplemente no se incorpora a ninguna capability pública de los cuatro dominios objetivo.

---

# 7. Inventario completo del router actual

El inventario base observado en `lib/custom-gpt-router.js` contiene exactamente estas 46 actions:

```text
01  list_tables
02  table_schema
03  query_table
04  profile_table
05  ventas_monthly_dedup_sensitivity_v01
06  ventas_cross_month_first_last_audit_v01
07  ventas_hybrid_unresolved_sensitivity_v01
08  ventas_unresolved_recognition_evidence_v01
09  ventas_identity_coverage_v01
10  ventas_monthly_actual_v01
11  ventas_daily_context_v01
12  ventas_daily_organizational_context_v01
13  daily_close_backtest_context_v01
14  daily_close_forecast_backtest_v01
15  daily_close_forecast_v01
16  current_month_close_forecast_v01
17  predictability_day_v01
18  intramonth_sales_history_context_v01
19  ventas_product_sales_v01
20  ventas_product_detail_v01
21  ventas_product_model_resolution_v01
22  ventas_product_concentration_v01
23  ventas_product_change_contribution_v01
24  ventas_store_change_contribution_v01
25  ventas_seller_change_contribution_v01
26  ventas_organizational_context_v01
27  expected_monthly_backtest_v01
28  expected_monthly_stability_v01
29  expected_monthly_candidates_v01
30  competitive_context_v01
31  competitive_share_trajectory_v01
32  competitive_signal_backtest_v01
33  competitive_relation_v01
34  competitive_inverse_share_movement_v01
35  rvm_market_history_v01
36  ventas_longitudinal_context_v01
37  rvm_longitudinal_context_v01
38  crm_longitudinal_context_v01
39  product_generation_context_v01
40  organizational_share_expectation_backtest_v01
41  organizational_relative_performance_v01
42  org_sales_deterioration_backtest_v01
43  org_sales_deterioration_episode_evidence_v01
44  org_sales_deterioration_status_v01
45  org_sales_observation_semantics_audit_v01
46  dealer_inventory_aging_v01
```

---

# 8. Reglas para la siguiente fase

La siguiente fase de implementación deberá respetar:

1. Un solo `custom-gpt-router.js` sigue siendo autoridad de ejecución.
2. Los endpoints de dominio son fachadas, no routers independientes.
3. El registry futuro resuelve `domain + capability -> action`.
4. El router debe fallar cerrado ante capability desconocida o capability válida de otro dominio.
5. Las actions físicas siguen disponibles internamente durante la transición.
6. No se modifica ningún motor para introducir este routing.
7. No se elimina `/api/custom-gpt` hasta validar compatibilidad y migración.
8. `rom/schema.json` se cambia sólo cuando las fachadas y el registry estén implementados y testeados.
9. `rom/motors.md` seguirá documentando capacidades, pero no deberá ser la autoridad de selección del LLM.
10. La lista pública futura debe derivarse de un registry estructurado, no de interpretación libre de documentación.

## Próxima pieza a construir

```text
DOMAIN_CAPABILITY_REGISTRY
```

Debe vivir en código y representar de forma explícita el mapeo de este inventario antes de crear los cuatro endpoints públicos.
