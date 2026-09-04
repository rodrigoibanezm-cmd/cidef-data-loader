# Intake — CIDEF Motor Lab

## Responsabilidad

Transformar una pregunta de negocio en un **plan mínimo de evidencia** usando las capabilities públicas AVAILABLE y, sólo cuando corresponda, demostrar la lógica necesaria para una nueva capacidad determinista.

```text
pregunta natural
→ intención
→ dominio
→ contexto necesario
→ capability(s) mínima(s)
→ evidencia
→ reducción progresiva del universo
→ respuesta o lógica demostrada
→ contrato de motor, sólo si corresponde
```

El intake NO parte desde tablas, motores físicos ni nombres internos.

---

## 1. Pregunta activa

Antes de consultar datos, formular una sola pregunta de negocio concreta.

Ejemplos:

```text
¿Cuánto vendió CIDEF el último mes cerrado?
¿Dongfeng está perdiendo participación?
¿Qué tiendas explican la caída?
¿Cómo está Bellavista?
```

No mezclar varias preguntas superiores en una misma exploración salvo que el usuario pida explícitamente una lectura integrada.

---

## 2. Clasificar la intención

Primero distinguir:

### DESCRIPTIVA

Pide un hecho acotado y no requiere interpretación contextual amplia.

Ejemplo:

```text
¿Cuántos VIN vendió Bellavista en julio?
```

→ usar directamente la capability mínima suficiente.

### ANALÍTICA / EVALUATIVA / DIAGNÓSTICA

La interpretación puede cambiar según el contexto mayor.

Ejemplos:

```text
¿Cómo está Bellavista?
¿Qué vendedor está peor?
¿Dongfeng está perdiendo terreno?
¿Qué explica la caída?
```

→ obtener primero el contexto más amplio pertinente y reducir progresivamente el universo.

---

## 3. Elegir dominio

La superficie pública está separada en:

```text
SALES
MARKET
DISCOVERY
LONGITUDINAL
```

El endpoint determina el dominio. El agente selecciona una `capability` válida dentro de ese dominio.

No enviar ni razonar en términos de motores físicos internos.

`rom/schema.json` es la autoridad operacional sobre qué capabilities existen y qué inputs aceptan.

---

## 4. Regla de profundidad

Para análisis amplios usar, cuando corresponda:

```text
BIG PICTURE
→ CONTEXTO
→ UNIVERSO RELEVANTE
→ MOVIMIENTO
→ CONTRIBUCIÓN / SEGMENTACIÓN
→ ENTIDAD ESPECÍFICA
```

Cada llamada debe justificar la siguiente reducción.

No comenzar por vendedor, modelo o tienda específica cuando una lectura más amplia sea necesaria para interpretar correctamente su situación.

Si el usuario ya pide un hecho acotado, no ampliar innecesariamente.

---

## 5. Múltiples capabilities

Una pregunta puede requerir varias llamadas.

Reglas:

- obtener evidencia base antes que evidencia derivada;
- no ejecutar una llamada dependiente antes de conocer el resultado que define su universo;
- detenerse cuando la evidencia sea suficiente;
- reutilizar contexto ya obtenido si sigue vigente el mismo período y universo;
- no invocar capabilities sólo porque están disponibles.

Ejemplo conceptual:

```text
pregunta amplia
→ contexto
→ identificar dónde está el movimiento
→ reducir a tienda/marca
→ abrir vendedor/modelo sólo si la evidencia lo exige
```

---

## 6. Uso de LONGITUDINAL

Usar LONGITUDINAL cuando la pregunta requiera entender evolución temporal o big picture histórico de:

```text
VENTAS → VIN propios
RVM    → mercado / share / posición
CRM    → demanda / gestión / conversión
```

No usar LONGITUDINAL por rutina en consultas descriptivas simples.

No forzar cortes temporales incompatibles entre fuentes.

Respetar completitud de período, `lastObservedDate`, `effectiveDateTo` y semántica SAME_DAY.

---

## 7. Uso de DISCOVERY

DISCOVERY existe para inspeccionar evidencia cuando:

- hay duda sobre tablas o columnas disponibles;
- debe validarse cobertura o estructura;
- una relación necesaria todavía no está encapsulada en una capability determinista.

Capabilities públicas:

```text
LIST_TABLES
TABLE_SCHEMA
PROFILE_TABLE
QUERY_TABLE
```

Usarlas en este orden sólo cuando sea necesario:

### LIST_TABLES
Si existe duda sobre la superficie disponible.

### TABLE_SCHEMA
Si no se conoce con certeza la estructura física.

### PROFILE_TABLE
Si hay que entender cardinalidad, nulos, rango o valores frecuentes.

### QUERY_TABLE
Si ya se sabe qué slice o agregado concreto se necesita.

No perfilar tablas por rutina.
No descargar filas si basta un agregado.
No usar DISCOVERY para reconstruir una lógica determinista ya AVAILABLE.

---

## 8. RAW + MASTER

```text
RAW = evidencia de hechos/eventos/fuente
MASTER = identidad estable compartida
```

No reemplazar identidad MASTER por normalización textual ad hoc.

Para vendedores, aplicar exclusivamente la semántica `VENDEDOR_CIDEF` vigente para la fecha correspondiente.

Si una unión o identidad requerida no puede demostrarse con las capacidades actuales, documentar exactamente qué relación falta. No simular joins complejos trayendo miles de filas al modelo.

---

## 9. DISCOVERY de una nueva capacidad

Sólo cuando las capabilities AVAILABLE no respondan de forma confiable la pregunta.

Trabajar hacia atrás:

```text
pregunta final
→ respuesta esperada
→ cálculo necesario
→ variables mínimas
→ evidencia necesaria
→ prueba mínima
→ reconciliación
→ lógica determinista demostrada
→ contrato de motor
```

Regla obligatoria:

> No diseñar ni implementar un motor antes de demostrar su cálculo con evidencia real.

No crear tablas, cubos, marts o abstracciones comunes por anticipación.

---

## 10. Cuándo cerrar la exploración

La exploración debe terminar cuando ya estén demostrados, según corresponda:

1. universo;
2. grain;
3. período;
4. variables;
5. mappings de identidad necesarios;
6. fórmula o relación observada;
7. casos límite materiales;
8. reconciliación básica;
9. evidencia suficiente para responder o diseñar.

No seguir consultando sólo para acumular contexto.

---

## 11. Contrato de motor propuesto

Cuando una nueva lógica esté demostrada:

```text
name:
business_question:
inputs:
source_tables:
identity_dependencies:
calculation:
filters:
output:
coverage:
warnings:
validation:
shared_dependencies:
```

Todo motor debe permitir comprobar, cuando corresponda:

```text
universo fuente
universo usado
exclusiones
reconciliación de agregados
nulos/no resueltos
```

No convertir asociación en causalidad.

---

## 12. Missing capability

Declarar una capacidad faltante sólo cuando la pregunta requiera evidencia o combinación que las capabilities actuales no pueden producir confiablemente.

Describir:

```text
question
missing_evidence
required_relationship
source_tables
proposed_calculation
why_current_capabilities_are_insufficient
```

No crear una capacidad nueva sólo porque una métrica sería interesante.

---

## Checklist previo a cada llamada

- [ ] ¿La pregunta es descriptiva o analítica?
- [ ] ¿Qué dominio corresponde?
- [ ] ¿Necesito contexto amplio antes de profundizar?
- [ ] ¿Qué hecho concreto quiero demostrar con esta llamada?
- [ ] ¿Esta capability es la mínima suficiente?
- [ ] ¿Depende de evidencia que todavía no tengo?
- [ ] ¿Estoy reduciendo justificadamente el universo?
- [ ] ¿Puedo reutilizar contexto ya obtenido?
- [ ] ¿La ventana temporal es compatible y está acotada?
- [ ] ¿Estoy evitando reconstrucciones manuales de capacidades ya AVAILABLE?
- [ ] ¿El resultado de esta llamada puede cambiar, reducir o cerrar el análisis?

Si la última respuesta es no, no ejecutar la llamada.
