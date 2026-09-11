# VENTAS — Dominio analítico

Estado documental: `CURRENT`

Este documento explica el dominio analítico **VENTAS** tal como existe hoy en el runtime CIDEF.

No redefine contratos ejecutables ni reglas operativas. La autoridad del comportamiento está en código productivo; la superficie pública está definida por `rom/schema.json`; las reglas de negocio viven en `rom/business-rules.md`.

## 1. Responsabilidad

VENTAS responde preguntas sobre **resultado y desempeño comercial CIDEF**, usando el VIN vendido como unidad central de resultado.

Su responsabilidad incluye, según la capability utilizada:

- resultado observado;
- evolución temporal;
- ritmo intramensual y cierre;
- producto;
- concentración;
- contribución al cambio;
- desempeño organizacional;
- brechas contra referencias deterministas;
- diagnóstico de crecimiento o deterioro.

VENTAS no representa el mercado externo. Comparaciones contra mercado pertenecen a RVM o a capabilities explícitamente diseñadas para combinar VENTAS con un benchmark RVM certificado.

## 2. Frontera pública

El dominio conceptual es:

```text
VENTAS
```

La superficie pública mantiene por compatibilidad el namespace:

```text
SALES
```

y el endpoint:

```text
POST /api/custom-gpt/sales
```

El agente invoca:

```text
SALES + capability + input
```

El backend resuelve esa capability al motor físico correspondiente. El agente no debe seleccionar nombres físicos de motores.

## 3. Universo comercial

Antes de grain, filtros o métrica debe establecerse el universo comercial aplicable.

```text
COMPANY    = resultado CIDEF reconocido
OWN_STORES = tiendas propias CIDEF
DEALERS    = red de concesionarios independientes
```

Estos universos no son intercambiables.

Reglas principales:

- tienda propia se evalúa dentro de `OWN_STORES`;
- dealer se evalúa dentro de `DEALERS`;
- `COMPANY` se utiliza para preguntas corporativas o métricas cuyo contrato lo requiera;
- `COMPANY` no es un fallback implícito;
- el scope no se infiere desde el grain;
- no se mezclan universos para construir comparaciones o ratios ad hoc.

`commercial_universe` pertenece a VENTAS y es conceptualmente distinto de `organization_scope` de RVM.

## 4. Universo analítico certificado

La frontera interna central es:

```text
ventas_universe_v01
```

Es un dataset analítico certificado de runtime. No es una capability pública ni contexto del agente.

Su composición conceptual es:

```text
ventas_context_v01
→ ventas_commercial_context_v01
→ ventas_universe_v01
→ familias VENTAS
```

El universo compone autoridades existentes; no redefine:

- reconocimiento de VIN vendido;
- identidad MASTER;
- pertenencia comercial;
- `VENDEDOR_CIDEF`;
- `COMPANY / OWN_STORES / DEALERS`.

No existe como tabla materializada que el agente deba consultar directamente.

## 5. Qué entrega el universo

El runtime entrega a consumidores compatibles eventos de venta reconocidos y enriquecidos con autoridades certificadas, incluyendo según corresponda:

- destino comercial;
- organización;
- dealer/grupo;
- producto/modelo/versión;
- pertenencia temporal de vendedor;
- cutoff solicitado y efectivo;
- lineage;
- cobertura de reconocimiento y resolución;
- validaciones y estados explícitos.

Los campos certificados se preparan upstream para que los motores downstream no repitan la resolución.

## 6. Invariante NO RECONSTRUCTION

Una familia migrada recibe sus filas desde el universo certificado.

No debe:

```text
releer RAW
→ volver a reconocer ventas
→ volver a resolver MASTER
→ volver a decidir pertenencia comercial
→ volver a resolver vendedor/producto
```

Debe:

```text
universo certificado
→ cálculo propio de la capability
→ resultado estructurado
```

Esta separación permite que reconocimiento, identidad y pertenencia tengan una sola autoridad.

## 7. Contexto vs cálculo

El agente puede requerir contexto de VENTAS para interpretar un resultado, pero ese contexto no se convierte en input oculto de una familia.

```text
CONTEXTO VENTAS ─────────────────→ AGENTE

UNIVERSO CERTIFICADO
→ FAMILIA DETERMINISTA
→ RESULTADO ─────────────────────→ AGENTE
```

La familia calcula sobre evidencia preparada. El agente integra contexto y resultado después.

## 8. Capabilities públicas actuales

La superficie `SALES` registrada actualmente contiene:

| Capability | Motor físico | Responsabilidad resumida |
|---|---|---|
| `COMMERCIAL_CONTEXT` | `ventas_commercial_context_v01` | Contexto y pertenencia comercial certificada. |
| `MONTHLY_ACTUAL` | `ventas_monthly_actual_v01` | Resultado mensual observado. |
| `DAILY_CLOSE_FORECAST` | `daily_close_forecast_v01` | Forecast determinista de cierre basado en estado intramensual. |
| `CURRENT_MONTH_CLOSE_FORECAST` | `current_month_close_forecast_v01` | Lectura de cierre del mes corriente bajo su contrato específico. |
| `PREDICTABILITY_DAY` | `predictability_day_v01` | Evidencia determinista sobre desde qué momento el cierre adquiere predictibilidad bajo el modelo implementado. |
| `INTRAMONTH_HISTORY` | `intramonth_sales_history_context_v01` | Historia del patrón intramensual. |
| `PACE_CHANGE` | `sales_pace_change_v01` | Cambio observado en ritmo de ventas; no equivale por sí solo a salud, suficiencia o riesgo. |
| `PRODUCT_SALES` | `ventas_product_sales_v01` | Ventas por producto bajo identidad certificada. |
| `PRODUCT_DETAIL` | `ventas_product_detail_v01` | Detalle analítico de producto. |
| `PRODUCT_CONCENTRATION` | `ventas_product_concentration_v01` | Concentración del resultado por producto. |
| `PRODUCT_CHANGE_CONTRIBUTION` | `ventas_product_change_contribution_v01` | Contribución de producto al cambio observado. |
| `STORE_CHANGE_CONTRIBUTION` | `ventas_store_change_contribution_v01` | Contribución de tienda al cambio observado. |
| `SELLER_CHANGE_CONTRIBUTION` | `ventas_seller_change_contribution_v01` | Contribución de vendedor al cambio observado. |
| `VIN_GAP` | `vin_gap_v01` | Primitive determinista de brecha VIN contra una referencia compatible. |
| `VIN_GROWTH_DIAGNOSTIC` | `vin_growth_diagnostic_v01` | Diagnóstico estructurado de crecimiento VIN. |
| `RELATIVE_PERFORMANCE` | `organizational_relative_performance_v01` | Desempeño relativo dentro de universos organizacionales compatibles. |
| `DETERIORATION_STATUS` | `org_sales_deterioration_status_v01` | Estado determinista de deterioro bajo su contrato de observación. |

La lista ejecutable vigente es `lib/custom-gpt/capabilityRegistry.js`. Este documento debe actualizarse si el registry cambia.

## 9. Capabilities y semántica

Una capability entrega sólo aquello que su contrato demuestra.

Ejemplos importantes:

### PACE_CHANGE

Mide cambio en ritmo observado.

Un resultado `STABLE` no significa automáticamente:

- buen desempeño;
- ritmo suficiente;
- cumplimiento de objetivo;
- salud comercial;
- forecast favorable;
- ausencia de riesgo.

### VIN_GAP

La convención certificada es:

```text
reference_vin - observed_vin
```

sobre un mes cerrado y un scope compatible según el contrato vigente.

La brecha por sí sola no demuestra oportunidad, capturabilidad, deterioro, riesgo ni prioridad.

### Contribuciones

Las capabilities de contribución explican cómo componentes compatibles participan del cambio observado. No convierten contribución en causalidad comercial.

## 10. Tiempo

VENTAS posee semánticas temporales propias y no debe asumir automáticamente equivalencia con el calendario de otros dominios.

Para comparaciones competitivas específicas, el `mes_venta` comercial certificado puede operar con frontera:

```text
día 02 → día 01 del mes siguiente
```

mientras RVM conserva mes calendario en sus eventos.

La capability que combine ambos dominios es responsable de preservar esa diferencia y definir una comparación válida.

Un mes incompleto no se trata como cierre.

## 11. Organización

La navegación analítica natural depende del universo.

Para `OWN_STORES`, cuando la evidencia y capability lo permiten:

```text
tienda
→ marca
→ vendedor
→ producto/modelo
→ VIN
```

Para `DEALERS`:

```text
dealer/grupo
→ marca
→ producto/modelo
→ VIN
```

No se transfieren automáticamente a DEALERS variables o metodologías propias de tiendas CIDEF, como CRM o vendedores internos.

La pertenencia de vendedor debe provenir de identidad/rol certificado y vigencia temporal; no se infiere desde la existencia de ventas.

## 12. Relación con RVM

VENTAS y RVM son dominios distintos.

VENTAS describe resultado comercial CIDEF. RVM describe matriculaciones de mercado.

Una capability cross-domain puede compararlos sólo bajo un contrato explícito.

Ejemplo vigente: `competitive_growth_matrix_v01` usa:

```text
CIDEF numerator = ventas_universe_v01[COMPANY]
benchmark       = rvm_universe_v01[ALL]
```

La comparación autorizada es crecimiento, cambio absoluto y dirección.

Está prohibido interpretar:

```text
VENTAS_COMPANY / RVM_REGISTRATIONS
```

como market share.

## 13. Relación con CRM

CRM aporta evidencia de demanda, gestión y conversión observable.

VENTAS aporta resultado VIN.

Cuando una pregunta requiera ambas fuentes, la integración ocurre en el agente después de recibir resultados deterministas compatibles.

No debe suponerse causalidad directa entre una métrica CRM y una venta sólo porque ambas se muevan conjuntamente.

## 14. Interpretación de negocio

El norte del dominio es entender, proteger o aumentar VIN, pero una métrica VENTAS no se transforma automáticamente en una conclusión de negocio.

```text
VIN ↓        ≠ deterioro
ventas ↑     ≠ ventaja
brecha VIN   ≠ oportunidad
pace estable ≠ salud comercial
```

La transformación desde evidencia a conceptos como deterioro, oportunidad, riesgo, ventaja, red flag o prioridad ocurre mediante la semántica del agente y exige la evidencia mínima correspondiente.

## 15. Qué no pertenece a este documento

Este documento no describe:

- carga de archivos;
- ETL;
- loaders;
- refresh/rebuild de tablas;
- migraciones de fuentes;
- generación de MASTER;
- diseños futuros no implementados.

Las tablas y autoridades consumidas por VENTAS se consideran entradas disponibles para efectos de esta documentación del runtime.

## 16. Autoridades relacionadas

```text
lib/custom-gpt/capabilityRegistry.js
  → mapping público capability → motor

rom/schema.json
  → contrato público de SALES/VENTAS

rom/business-rules.md
  → universos comerciales, comparabilidad y reglas de negocio

rom/business-semantics.md
  → nivel de conclusión permitido por la evidencia

rom/orchestrator.md
  → selección y coordinación de capabilities

docs/architecture/VENTAS_ANALYTICAL_UNIVERSE_V0.1.md
  → contrato documental detallado de ventas_universe_v01

docs/agent/README.md
  → arquitectura general del agente
```

## 17. Resumen de invariantes VENTAS

1. El VIN vendido es la unidad central de resultado comercial.
2. `commercial_universe` se fija antes de grain y métrica.
3. `COMPANY`, `OWN_STORES` y `DEALERS` no son universos intercambiables.
4. Las familias compatibles calculan sobre `ventas_universe_v01` y no reconstruyen autoridades upstream.
5. Contexto y universo certificado son carriles distintos.
6. El agente selecciona capabilities públicas, no motores físicos.
7. Una métrica no autoriza por sí sola una conclusión semántica más fuerte.
8. Mes incompleto no equivale a cierre.
9. VENTAS y RVM no se mezclan sin contrato cross-domain explícito.
10. La integración con CRM/RVM ocurre en el agente salvo capabilities deterministas diseñadas explícitamente para combinar fuentes.
