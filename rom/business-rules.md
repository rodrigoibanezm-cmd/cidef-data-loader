# Reglas de negocio CIDEF

Autoridad permanente para interpretar cómo funciona el negocio. No redefine cálculos, identidad ni contratos deterministas. La definición de conceptos analíticos como oportunidad, deterioro, riesgo, ventaja, red flag o prioridad vive en `business-semantics.md`.

## 1. Norte comercial
La unidad central de resultado es el **VIN vendido**. Priorizar análisis que ayuden a entender, proteger o aumentar VIN: nivel, crecimiento, riesgo y crecimiento disponible.

Stock, costo, margen, precio o flujo administrativo son secundarios salvo que la pregunta los requiera o exista evidencia de vínculo con VIN.

CIDEF viene de crecimiento y buenos resultados: no presumir crisis ni buscar defectos artificialmente. El desafío es detectar dónde un negocio que funciona bien puede capturar menos crecimiento del disponible.

**Crecer no implica capturar todo el potencial.** Una tienda o marca puede crecer y simultáneamente perder posición, quedar bajo su trayectoria o esconder focos de oportunidad.

## 2. Universos comerciales
```text
COMPANY    = resultado CIDEF reconocido
OWN_STORES = tiendas propias CIDEF
DEALERS    = red de concesionarios independientes
```

`commercial_universe` describe canal y es independiente de `organization_scope` de RVM.

Tiendas propias y dealers contribuyen a COMPANY, pero no son universos equivalentes:
- tienda propia se evalúa dentro de `OWN_STORES`;
- dealer se evalúa dentro de `DEALERS`;
- `COMPANY` se usa para preguntas corporativas o métricas deterministas de contribución/mix.

No mezclar universos para desempeño, crecimiento, share, riesgo u oportunidad. Las relaciones válidas entre numerador y denominador las define la métrica determinista; no inventarlas en el agente.

### OWN_STORES
Cuando exista evidencia, la navegación puede usar:
`tienda → marca → vendedor → producto/modelo → CRM → VIN`.

### DEALERS
Es una red externa. Según evidencia:
`dealer/grupo → territorio → marca → producto/modelo → VIN → evolución/posición → RVM territorial`.

No asumir que CRM, vendedores u otras variables internas de tiendas propias existen para dealers.

## 3. RVM, territorio y canal
RVM describe matriculaciones del mercado. No identifica por sí solo si una venta corresponde a `OWN_STORES`, `DEALERS` u otro actor.

Antes de atribuir una señal geográfica a CIDEF determinar:
`territorio → presencia CIDEF → OWN_STORES/DEALERS/ambos → universo comparable`.

Una oportunidad territorial puede sostenerse a nivel de red CIDEF sin poder atribuirse a una tienda o dealer específico. En ese caso mantener la conclusión en ese nivel.

No interpretar `VIN OWN_STORES / RVM total` ni `VIN DEALERS / RVM total` como penetración del canal salvo que exista un denominador externo certificado compatible.

## 4. Comparaciones justas
Preferir comparaciones estructuralmente equivalentes:
- tienda propia vs tiendas propias;
- dealer vs dealers;
- vendedor dentro de su universo aplicable;
- marca vs mercado relevante;
- modelo vs universo competitivo pertinente;
- presente vs historia comparable.

Cuando la evidencia lo permita, mirar además del volumen: crecimiento relativo, posición, share, trayectoria, expectativa y gap.

Meses incompletos no se tratan como cierres.

Para `vin_gap_v01`, la convención es `reference_vin - observed_vin` sobre un mes cerrado y un scope compatible `OWN_STORES × STORE × BRAND`. La referencia sólo existe cuando el ganador evaluable de `expected_monthly_*` tiene evidencia de backtest y un candidato disponible para el mes objetivo. `stability` se conserva como diagnóstico y no introduce un threshold de exclusión.

## 5. Marco de interpretación
Cuando corresponda:
```text
VIN observado
→ cambio temporal
→ expectativa
→ contexto
→ gap
→ evidencia explicativa
→ interpretación semántica
```

La interpretación semántica de `oportunidad`, `riesgo`, `deterioro`, `ventaja`, `fortaleza`, `red flag`, `prioridad`, `señal` y `accionabilidad` se rige por `business-semantics.md`.

Distinguir siempre hecho, cálculo, interpretación y causalidad, aunque producción no necesite mostrar esas etiquetas.

La bajada natural es:
`CIDEF → universo comercial → tienda/dealer → marca → vendedor cuando aplique → producto/modelo`.

Bajar de nivel sólo para explicar o localizar VIN, no para producir detalle por sí mismo.

## 6. Prudencia
No:
- buscar culpables;
- asumir mala gestión desde bajo desempeño;
- asumir que una tienda grande necesariamente debe crecer más;
- convertir correlación en causa;
- mezclar universos para obtener comparaciones llamativas;
- presentar oportunidad estimada como venta asegurada;
- interpretar ausencia de evidencia como ausencia del fenómeno.

Cuando la evidencia sea insuficiente: `NO_SABEMOS` o equivalente sustentado.

Las equivalencias físicas, temporales y de pertenencia viven en MASTER/motores, no en este documento.
