# Orquestador analítico — CIDEF

## Propósito

Gobierna cómo el agente transforma una pregunta en una secuencia de capabilities públicas. No define métricas, identidad ni cálculos y no reemplaza `schema.json`.

La orquestación es interna: no explicar al usuario la secuencia de capabilities, llamadas ni reglas del orquestador salvo que lo solicite.

## Principio rector

**Partir del universo más amplio que sea pertinente y reducirlo sólo cuando la evidencia justifique bajar de nivel.**

```text
PREGUNTA
→ BIG PICTURE pertinente
→ CONTEXTO DE DOMINIO
→ UNIVERSO RELEVANTE
→ MOVIMIENTO
→ CONTRIBUCIÓN / SEGMENTACIÓN
→ ENTIDAD ESPECÍFICA
→ SÍNTESIS
```

No es obligatorio recorrer todos los niveles. Es una dirección de análisis, no un workflow rígido.

## 1. Clasificar la intención

### Hecho directo
Pregunta descriptiva con universo y métrica suficientemente definidos.

Ejemplo: `¿Cuántos VIN vendió Bellavista en julio?`

→ usar directamente la capability mínima suficiente.

### Pregunta analítica
Requiere comparación, trayectoria, evaluación, explicación, diagnóstico, riesgo u oportunidad.

Ejemplos:
- ¿Cómo está Bellavista?
- ¿Dongfeng está perdiendo terreno?
- ¿Qué vendedores vienen deteriorándose?
- ¿Qué explica el movimiento?
- ¿Dónde estamos dejando crecimiento sin capturar?

→ obtener primero el contexto que pueda cambiar la interpretación.

## 2. Big picture

Combinar, cuando sea pertinente:

```text
VENTAS → VIN reconocidos dentro del universo comercial solicitado
RVM    → mercado / share / posición
CRM    → demanda / gestión / conversión
```

No llamar las tres fuentes por rutina. Usar sólo las necesarias para la pregunta.

Cuando la evolución temporal sea material, LONGITUDINAL es la fuente de contexto temporal.

El big picture sirve para interpretar. No demuestra causalidad ni sustituye una capability diagnóstica específica.

## 3. Fijar el dominio comercial de VENTAS

Antes de ejecutar una capability VENTAS cuyo resultado dependa del canal comercial, fijar explícitamente el universo permitido:

```text
commercial_universe = COMPANY | OWN_STORES | DEALERS
```

Semántica:

```text
COMPANY    → todas las ventas reconocidas, incluidos residuales de canal no resuelto
OWN_STORES → sólo destino canónico TIENDA_PROPIA
DEALERS    → sólo destino canónico DEALER
```

La autoridad de esta frontera es `vehiculo_canonico` mediante `ventas_commercial_context_v01` / `SALES.COMMERCIAL_CONTEXT`.

El orden semántico es:

```text
DOMAIN
→ FILTER
→ GRAIN
→ METRIC
```

`commercial_universe` define qué ventas pueden existir dentro del análisis. `filter` sólo reduce ese dominio. `grain` sólo define cómo agruparlo. Ninguno puede ampliar ni redefinir el scope.

Reglas:

- preguntas sobre tiendas propias, sucursales CIDEF o vendedores CIDEF → `OWN_STORES`;
- preguntas sobre dealers o dealer groups → `DEALERS`;
- `COMPANY` sólo cuando la intención realmente abarca el universo total reconocido;
- no usar `COMPANY` como fallback semántico ante una pregunta cuyo canal está implícita o explícitamente acotado;
- no inferir el dominio desde `grain`: resolver primero la intención comercial y luego elegir grain;
- un consumidor puede bajar de `OWN_STORES → tienda → marca → vendedor`, pero nunca volver a `COMPANY`;
- combinaciones incompatibles deben fallar como `DOMAIN_MISMATCH`, no degradarse silenciosamente.

Para `LONGITUDINAL / VENTAS`, enviar siempre `commercial_universe` explícito. Ejemplos:

```text
commercial_universe = OWN_STORES + grain = STORE   → válido
commercial_universe = DEALERS    + grain = DEALER  → válido
commercial_universe = COMPANY    + grain = STORE   → inválido
commercial_universe = OWN_STORES + grain = DEALER  → inválido
```

Para BRAND, MODEL o VERSION tampoco inferir el universo: respetar el `commercial_universe` pertinente a la pregunta.

Para `LONGITUDINAL / CRM`, enviar siempre `commercial_universe` explícito. CRM certifica `COMPANY` y `OWN_STORES`; `OWN_STORES` exige resolución exacta de `Sucursal Asignada` a `sucursales_master.tipo_canal=CIDEF`. `STORE` y `SELLER` sólo son válidos en `OWN_STORES`. `DEALERS` no es evaluable mientras CRM no tenga identidad dealer canónica certificada y debe fallar explícitamente; nunca inferir dealer por exclusión.

## 4. Reducir el universo

Después del contexto, bajar al siguiente nivel sólo si ayuda a responder la pregunta.

Ejemplo comercial:

```text
CIDEF → marca → tienda → vendedor → producto/modelo
```

Ejemplo competitivo:

```text
mercado → segmento/marca → modelo → competidor → geografía, si corresponde
```

No comenzar por vendedor/modelo si el fenómeno todavía no está localizado en el nivel superior, salvo que el usuario haya pedido explícitamente ese universo.

### Oportunidad y crecimiento disponible

Un agregado positivo no descarta oportunidad no capturada en niveles inferiores.

Ejemplo: crecer más rápido que el mercado agregado permite afirmar **captura superior agregada**, pero no permite concluir por sí solo que no exista crecimiento disponible en tiendas, modelos, segmentos, geografías o demanda comercial.

Si la pregunta es sobre oportunidad, riesgo o crecimiento disponible:

- separar desempeño observado de oportunidad no capturada;
- no cerrar `NOT_SUPPORTED` sólo con evidencia agregada;
- descender a los niveles que puedan ocultar heterogeneidad material, siempre que existan capabilities y evidencia suficientes;
- si no existe evidencia para evaluar esos niveles, concluir `INSUFFICIENT_EVIDENCE` o equivalente, no ausencia de oportunidad.

## 5. Múltiples capabilities

Una pregunta puede requerir varias llamadas.

- evidencia base antes que derivada;
- cada llamada debe reducir incertidumbre, reducir universo o validar una interpretación;
- no ejecutar llamadas que no puedan cambiar la respuesta;
- resolver en secuencia las llamadas dependientes;
- reutilizar evidencia vigente del mismo universo y corte temporal;
- detenerse cuando exista evidencia suficiente.

Cuando se integren outputs de dominios distintos y ambos declaren scope comercial, el universo debe ser compatible. Si no coincide, no integrar silenciosamente.

Para integración `VENTAS ↔ CRM`, la compatibilidad comercial es exacta:

```text
VENTAS COMPANY    ↔ CRM COMPANY    → COMPATIBLE
VENTAS OWN_STORES ↔ CRM OWN_STORES → COMPATIBLE
cualquier otro cruce               → DOMAIN_MISMATCH
```

La comparación usa el `commercial_scope` ya certificado por cada dominio y ocurre antes de componer sus resultados. No redefinir ni inferir el dominio desde grain, filtros, keywords o nombres de entidades. `CRM DEALERS` sigue siendo `UNSUPPORTED_COMMERCIAL_UNIVERSE` y debe fallar en CRM antes de cualquier validación cross-domain.

## 6. Ausencia de observaciones

**Cero observado no equivale automáticamente a cero fenómeno.**

Ante `0 rows`, `0 observations`, serie vacía o ausencia inesperada de datos, distinguir antes de interpretar:

```text
ZERO_OBSERVED     → cobertura válida y fenómeno realmente observado en cero
NO_COVERAGE       → la fuente no cubre adecuadamente ese universo/período
FILTER_MISMATCH   → filtro/identidad/semántica puede no corresponder a la fuente
NOT_EVALUABLE     → evidencia insuficiente para decidir
```

Si el cero es inesperado respecto del contexto conocido de la fuente, validar cobertura, identidad, filtros y período antes de convertirlo en conclusión de negocio.

Una fuente sin evidencia evaluable no debe utilizarse como evidencia de ausencia.

## 7. Dominios públicos

**SALES** — scope comercial certificado, VIN, cierre, producto, tienda, vendedor, concentración, contribución, desempeño y deterioro.

**MARKET** — mercado/RVM, contexto competitivo, share, trayectoria, relaciones e historia.

**DISCOVERY** — inspección controlada cuando una capability no existe o debe validarse. No reconstruir manualmente lógica ya AVAILABLE.

**LONGITUDINAL** — contexto temporal normalizado de VENTAS, RVM y CRM.

`schema.json` es la autoridad sobre capabilities e inputs.

## 8. Compatibilidad temporal

Antes de integrar fuentes verificar comparabilidad temporal. Respetar período completo/incompleto, `lastObservedDate`, `effectiveDateTo` y SAME_DAY.

SAME_DAY compara igual posición de calendario; no reconstruye estado histórico as-of.

Si las fuentes tienen cortes distintos, usar el mínimo corte común cuando la comparación lo requiera o declarar la limitación.

## 9. Criterio de salida

Antes de responder comprobar internamente:

```text
¿El dominio comercial corresponde exactamente a la intención de la pregunta?
¿Tengo contexto suficiente para interpretar?
¿Localicé el fenómeno al nivel necesario?
¿Confundí ausencia de observaciones con ausencia del fenómeno?
¿Un agregado está ocultando heterogeneidad relevante para la pregunta?
¿Otra capability podría cambiar materialmente la conclusión?
```

Si no queda una prueba disponible capaz de cambiar materialmente la conclusión, detener llamadas y renderizar.

La salida final se rige por `render.md` o `render-production.md` según fase y audiencia. No narrar la mecánica de orquestación en la respuesta final.
