# CANONICAL_ANALYTICS_V0.1

## OBJETIVO

Definir arquitectura analítica V0.1, responsabilidades por capa y grains canónicos.

## ARQUITECTURA

```text
FUENTES
→ RAW
→ MASTER / DIMENSIONES CONFORMADAS
→ HECHOS CANÓNICOS
→ MÉTRICAS CERTIFICADAS
→ MARTS / CUBOS
→ MOTORES DETERMINISTAS POR FAMILIA DE PREGUNTAS
→ LLM
```

## CONTRATO TRANSVERSAL

- RAW conserva evidencia fuente.
- MASTER resuelve identidad.
- Hechos canónicos representan estado o eventos a grain explícito.
- Métricas certificadas fijan cómo se mide.
- Marts/cubos optimizan consulta; NO son fuente de verdad.
- Motores responden familias de preguntas mediante cálculo determinista.
- LLM selecciona, interpreta y explica; NO redefine métricas ni ejecuta cálculo crítico.
- Motores de negocio NO consumen RAW.
- Toda fuente debe llegar auditada, normalizada y procesada antes del consumo por motores.

## 1. RAW

### FUENTES ACTUALES

- `vehiculos_raw`
- `ventas_raw`
- `notas_venta_raw`

### REGLAS

- Preservar evidencia de origen.
- NO resolver identidad.
- NO redefinir métricas.
- NO usar como interfaz directa de motores de negocio.

## 2. MASTER / DIMENSIONES CONFORMADAS

### ESTADO

**MASTER V0.1 CERRADA / VALIDADA — 2026-08-31.**

### OBJETIVO
Resolver identidad estable compartida.

### V0.1 FÍSICA CERRADA

- producto;
- sucursal;
- persona;
- dealer.

Contrato detallado: `docs/master/MASTER_LAYER_V0.1.md`.
Implementación validada: `docs/master/MASTER_IMPLEMENTATION_V0.1.md`.

### TIEMPO

La dimensión tiempo forma parte de la arquitectura dimensional general, pero NO fue requisito físico para cerrar la caja MASTER V0.1 de identidad.

Su contrato físico se define cuando la capa canónica/métricas lo requiera.

NO inventar `dim_tiempo` como dependencia retroactiva del cierre MASTER.

### REGLAS

- Identidades compartidas por hechos, métricas y motores.
- NO redefinir identidad por motor o cubo.
- MASTER NO contiene hechos comerciales, stock, ventas ni trayectoria operacional.

## 3. HECHOS CANÓNICOS

### `vehiculo_canonico`

**ESTADO: IMPLEMENTADO / VALIDADO / CERRADO V0.1 — 2026-08-31.**

**GRAIN:** 1 estado actual por VIN.

**REPRESENTA:** entidad operacional actual del vehículo.

**IMPLEMENTADO:**
- producto MASTER nullable;
- stock/estado actual;
- hitos temporales relevantes;
- ubicación logística fuente;
- referencias NV/factura;
- venta actual;
- canal de salida actual;
- sucursal propia de venta cuando corresponde;
- dealer/dealer group cuando existe resolución determinista.

**REGLAS:**
- NO mantener snapshot diario por defecto.
- Aging debe derivarse prioritariamente desde hitos temporales + estado actual.
- Estado actual proviene de `vehiculos_raw`.
- Contexto comercial actual se vincula por VIN + factura actual; NO por historial arbitrario del VIN.
- Forum nunca es dealer final.
- `entidad_financiera=FORUM` por sí sola NO convierte una venta en dealer.
- Para comprador actual Forum, el dealer real se resuelve desde comentario de la misma operación/NV con precedencia RUT → razón social → nombre comercial.
- Ambigüedad o conflicto se conserva como `NO_RESUELTO`; no se inventa precedencia de negocio.

**VALIDACIÓN FINAL:**

```text
universo                    = 46.373
vendidos                    = 43.239
tienda_propia               = 25.432
dealer                      = 17.357
dealer_directo              = 13.730
dealer_via_forum            = 3.448
dealer_sin_resolver         = 179
dealer_id_resuelto          = 17.178
dealer_group_resuelto       = 17.179
integridad_tienda_fallida   = 0
integridad_dealer_fallida   = 0
```

Contrato detallado: `docs/canonical/VEHICULO_CANONICO_V0.1.md`.

### `fact_operacion`

**ESTADO: SIGUIENTE HECHO CANÓNICO A IMPLEMENTAR.**

**GRAIN:** 1 unidad dentro de un proceso comercial.

Clave conceptual aproximada:

```text
nota_de_venta + nro_operacion + VIN
```

**REPRESENTA:** trayectoria comercial de una unidad.

**DEBE CONSERVAR cuando exista evidencia:**
- creación/fecha NV;
- reserva;
- autorización;
- factura/fecha factura;
- entrega/pendiente entrega;
- etapa/estado.

**REGLAS:**
- NO definir como 1 fila por NV.
- NV y `nro_operacion` son agrupadores; NO sustituyen grain unidad.
- Antes de DDL debe fijarse contrato físico y reconciliación fuente por fuente.

### `fact_venta`

**ESTADO: NO INICIADO.**

**GRAIN:** 1 unidad vendida reconocida por negocio.

Clave conceptual aproximada:

```text
nro_operacion + nro_propuesta + VIN
```

**REPRESENTA:** resultado comercial reconocido para una unidad.

**REGLAS:**
- NO definir como 1 fila por operación.
- NO definir como 1 fila por factura.
- Operación, propuesta y factura pueden agrupar múltiples unidades.

### `fact_mercado`

**ESTADO:** GAP DE CONTRATO.

**OBJETIVO:** representar hechos externos de mercado procesados.

**REGLAS:**
- Definir grain antes de implementación física.
- RVM/ANAC RAW NO es `fact_mercado`.
- Auditar duplicidad, `cantidad`, VIN, nomenclatura de producto y geografía antes de congelar contrato.
- Debe habilitar Familia 2 — Posición competitiva.

## 4. REGLA DE GRAIN

Toda métrica de unidades DEBE partir desde grain unidad.

`NV`, `operación`, `propuesta` y `factura` son atributos/agrupadores según análisis; NO sustituyen conteo de unidades.

## 5. MÉTRICAS CERTIFICADAS

### OBJETIVO
Definir una sola vez cómo se mide cada concepto reutilizable.

### CANDIDATAS V0.1

- `ventas_unidades`
- `stock_unidades`
- `stock_disponible`
- `aging_stock`
- `aging_nv_factura`
- `tiempo_creacion_nv`
- `tiempo_factura_entrega`
- `cumplimiento`
- `participacion_mercado` cuando exista contrato de mercado.

### CONTRATO OBLIGATORIO POR MÉTRICA

- grain;
- universo;
- fórmula;
- exclusiones;
- null handling;
- dimensiones soportadas;
- reconciliación/validaciones.

### REGLAS

- Motores NO redefinen métricas certificadas.
- Aging histórico usa hitos `fecha_in` / `fecha_out` cuando existan.
- Para procesos abiertos, `fecha_actual - fecha_in` SOLO si el contrato de la métrica lo permite.

## 6. MARTS / CUBOS

### OBJETIVO
Optimizar consultas sobre hechos canónicos + métricas certificadas.

### V0.1

- `cube_comercial`
- `cube_flujo`
- `cube_stock`
- `cube_mercado` SOLO cuando exista `fact_mercado`.

### REGLAS

- NO son fuente de verdad.
- NO crear un cubo por motor.
- NO redefinir grains, identidad ni métricas.
- Deben ser reemplazables sin cambiar semántica.
- Dimensiones/agregaciones deben justificarse por preguntas vigentes.

## 7. MOTORES DETERMINISTAS

Contrato vigente: `docs/business-agent/QUESTION_FAMILIES_V0.1.md`.

### REGLAS

- 1 familia de preguntas → 1 motor determinista.
- Auditores/validadores pueden ser transversales.
- Las familias NO son páginas BI.
- Cada motor consume evidencia procesada + métricas certificadas.
- Un motor NO posee su propia definición de venta, stock, aging, persona, producto o sucursal.

## 8. RESPONSABILIDAD POR CAPA

```text
RAW = evidencia
MASTER = identidad
HECHOS = realidad a grain canónico
MÉTRICAS = medición certificada
MARTS/CUBOS = acceso eficiente
MOTORES = análisis determinista por pregunta
LLM = selección + explicación
```

## 9. DECISIONES CONGELADAS

1. Cubos NO son fuente de verdad.
2. Grains canónicos deben permanecer estables salvo nueva evidencia que obligue versionar contrato.
3. `vehiculo_canonico` = VIN actual.
4. `fact_operacion` = unidad dentro de proceso comercial.
5. `fact_venta` = unidad vendida reconocida.
6. Métricas de unidades parten desde grain unidad.
7. Dimensiones conformadas son compartidas.
8. Métricas básicas se certifican una sola vez.
9. Cubos se crean por dominio factual, NO por motor.
10. V0.1 NO persiste snapshots diarios de estado de vehículo por defecto.
11. Motores de negocio NO consumen RAW.
12. Preguntas de negocio gobiernan requisitos de capas analíticas posteriores.
13. MASTER V0.1 cerrada = producto + sucursal + persona + dealer.
14. Dimensión tiempo se define físicamente cuando sea requerida por hechos/métricas; no reabre MASTER V0.1.
15. `vehiculo_canonico` V0.1 queda cerrado con resolución determinista de canal/dealer actual.
16. El siguiente hecho canónico es `fact_operacion`; no iniciar `fact_venta` antes de cerrar `fact_operacion`.

## 10. CONTRATO FÍSICO PENDIENTE

Antes de implementar cada hecho canónico DEBE fijarse:

- PK técnica;
- clave natural/canónica;
- FK a MASTER;
- campos fuente;
- deduplicación;
- reconciliación entre fuentes;
- exclusiones;
- métricas soportadas;
- validaciones de integridad.

`fact_operacion` es el próximo contrato físico pendiente.
`fact_mercado` requiere contrato propio antes de `cube_mercado`.
