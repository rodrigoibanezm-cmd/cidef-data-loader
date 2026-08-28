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

### OBJETIVO
Resolver identidad estable compartida.

### V0.1

- producto;
- sucursal;
- persona;
- dealer;
- tiempo.

Contrato detallado: `docs/master/MASTER_LAYER_V0.1.md`.

### REGLAS

- Identidades compartidas por hechos, métricas y motores.
- NO redefinir identidad por motor o cubo.
- MASTER NO contiene hechos comerciales, stock, ventas ni trayectoria operacional.

## 3. HECHOS CANÓNICOS

### `vehiculo_canonico`

**GRAIN:** 1 estado actual por VIN.

**REPRESENTA:** entidad operacional actual del vehículo.

**DEBE SOPORTAR:**
- producto;
- stock/estado actual;
- hitos temporales relevantes;
- ubicación logística fuente;
- referencias NV/factura cuando correspondan.

**REGLAS:**
- NO mantener snapshot diario por defecto.
- Aging debe derivarse prioritariamente desde hitos temporales + estado actual.

### `fact_operacion`

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

### `fact_venta`

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

### FAMILIAS V0.1

1. Expectativa de cierre.
2. Posición competitiva.
3. Deterioro y red flags.
4. Desempeño relativo.
5. Accionabilidad.

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

`fact_mercado` requiere contrato propio antes de `cube_mercado`.
