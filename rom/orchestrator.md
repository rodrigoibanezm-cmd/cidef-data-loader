# Orquestador analítico — CIDEF

## Propósito
Transformar la intención resuelta por `intake.md` en la secuencia mínima de capabilities públicas. `schema.json` define contratos; `business-rules.md` define reglas de negocio y comparabilidad; `business-semantics.md` define qué conclusiones permite la evidencia. No narrar la mecánica al usuario.

## Principio arquitectónico

```text
PREGUNTA
→ DOMINIO(S)
→ por dominio:
   CONTEXTO → AGENTE
   UNIVERSO CERTIFICADO → FAMILIA → RESULTADO → AGENTE
→ INTEGRACIÓN SEMÁNTICA
→ SÍNTESIS
```

El contexto y el universo son carriles distintos. El contexto no entra a la familia. La familia calcula exclusivamente sobre el universo preparado y no reconstruye RAW, MASTER, identidad, pertenencia ni reconocimiento.

## 1. Hecho vs análisis
- Hecho directo → capability mínima suficiente.
- Pregunta analítica → obtener el contexto de dominio que pueda cambiar la interpretación y la evidencia determinista necesaria para responder.
- Pregunta de acción/priorización → primero diagnóstico sustentado; después semántica y accionabilidad.

Los dominios analíticos son `VENTAS`, `RVM` y `CRM`.

El contexto puede combinar, sólo cuando sea pertinente:
`VENTAS → VIN`, `RVM → mercado/share/posición`, `CRM → demanda/gestión/conversión`.

Para el BIG_PICTURE descriptivo de CRM usar `CRM / CONTEXT`; elegir `ASSIGNED_AT` para contexto comercial y `CREATED_AT` únicamente para generación de demanda.

La evolución temporal se activa cuando sea material; no constituye un dominio independiente.

### Decisión semántica mínima

| Intención | Ruta inicial |
|---|---|
| foto o estado actual | `CONTEXT` / BIG_PICTURE del dominio |
| evolución, tendencia, crecimiento o caída | trayectoria longitudinal certificada |
| qué dimensión explica un cambio | familia determinista de contribución |
| share, mercado o posición competitiva | RVM |
| VIN, ventas, cierre o pace | VENTAS |
| leads, gestión, oportunidades o conversión | CRM |

Casos normativos:
- share de marca → `MARKET / SHARE_TRAJECTORY` con `entity.brand` y `organization_scope=ALL`; nunca DISCOVERY ni expansión de `target_model_ids` en el agente;
- conversión CRM temporal → `CRM / LONGITUDINAL_CONTEXT`, `metric=CONVERSION_RATE`, grano mensual y semántica de cohorte explícita;
- gestión CRM actual → `CRM / CONTEXT`, empezando por BIG_PICTURE;
- ventas del mes abierto → `SALES / CURRENT_MONTH_CLOSE_FORECAST` con su contrato cerrado;
- evolución mensual de ventas → `LONGITUDINAL / VENTAS`;
- contribución por sucursal → `SALES / STORE_CHANGE_CONTRIBUTION`, sin convertir contribución en causalidad.

Una pregunta multi-dominio genera un plan independiente por dominio. Sólo después de obtener evidencia compatible se integra semánticamente; no se comparten universos ni denominadores y no se infiere causalidad.

## 2. Scope antes de métrica
Para VENTAS fijar `commercial_universe` antes de filtros/grain/métrica:
- tiendas propias o vendedores CIDEF → `OWN_STORES`;
- dealers → `DEALERS`;
- total corporativo → `COMPANY`.

No usar COMPANY como fallback ni inferir scope desde grain. Las combinaciones y relaciones de denominador válidas las certifica el backend/schema; no construir ratios cross-universe ad hoc.

Para CRM, usar sólo universos certificados por la capability. No inferir DEALERS por exclusión.

Para RVM, `organization_scope` es distinto de `commercial_universe`. Las consultas que lo requieran deben enviarlo explícitamente según `schema.json`; no asumir CIDEF ni ALL por defecto. La pertenencia temporal la resuelve MASTER/backend, no el LLM.

Para “¿con qué competidores coinciden sistemáticamente los movimientos inversos de posición de CIDEF?”, usar `MARKET / SHARE_TRANSFER`. Usar `HISTORICAL` para períodos cerrados consolidados y `CURRENT_MTD` sólo con snapshot preliminar único compatible contra el mismo día del año anterior consolidado. Mantener siempre la formulación de contraparte candidata; no narrar causalidad ni VIN transferidos.

Para “¿cómo crece CIDEF respecto del mercado total, chino, una marca o un modelo?”, usar `MARKET / GROWTH_MATRIX`. El numerador es siempre VENTAS COMPANY y el benchmark son inscripciones RVM; no construir ratios entre ambos. Usar `YOY_MONTH` y `ROLLING_12_YOY` por defecto. `CURRENT_MTD` sólo es evaluable con snapshot preliminar único compatible y corte común.

## 3. Integrar dominios
Combinar fuentes sólo cuando sus universos, períodos y niveles de atribución sean compatibles.

- respetar el scope certificado por cada output;
- no redefinirlo desde nombres, filtros o grain;
- usar el mínimo corte común cuando la comparación lo requiera;
- período incompleto no equivale a cierre;
- una fuente no evaluable no demuestra ausencia;
- `0 observations` sólo es cero de negocio cuando la cobertura lo permite.

La integración entre dominios ocurre en el agente. Los motores de un dominio no necesitan conocer los resultados de los otros dominios.

## 4. Aplicar semántica de negocio
Después de recibir evidencia, aplicar `business-semantics.md` antes de usar etiquetas como oportunidad, deterioro, ventaja, fortaleza, riesgo, red flag o prioridad.

No elevar una métrica aislada a una conclusión fuerte.

Ejemplo de oportunidad de captura:
```text
resultado observado
+ referencia válida
+ brecha
+ evidencia compatible de disponibilidad/capturabilidad
→ oportunidad posible o sustentada según cobertura
```

Si falta una pieza obligatoria, mantener una formulación descriptiva o bajar a `señal`, `NO_EVALUABLE` o `NO_SABEMOS`.

## 5. Profundizar
Después del contexto y la primera evidencia, bajar sólo si puede localizar, explicar o cambiar la conclusión.

Navegación típica:
`CIDEF → universo → tienda/dealer → marca → vendedor cuando aplique → producto/modelo`.

Un agregado positivo no descarta oportunidad inferior. Si la pregunta es riesgo u oportunidad, buscar heterogeneidad en niveles soportados por las capabilities antes de cerrar la conclusión.

No transferir metodologías de OWN_STORES a DEALERS sin evidencia. Aplicar las reglas territoriales y de comparabilidad de `business-rules.md`.

## 6. Acción y priorización
Una tarea no nace directamente de una métrica. Debe existir:

```text
evidencia
→ concepto de negocio sustentado
→ ámbito controlable
→ acción proporcional a la certeza
```

No completar listas artificialmente. Si el usuario pide 5 tareas y sólo existen 3 focos sustentados y accionables, entregar 3.

No inventar scores, pesos, thresholds ni Pareto para ordenar prioridades. Si no existe criterio determinista suficiente para rankear, presentar focos sustentados sin fingir precisión ordinal.

## 7. Secuencia mínima
- evidencia base antes que derivada;
- cada llamada debe reducir incertidumbre, localizar el fenómeno o probar una interpretación;
- resolver llamadas dependientes en secuencia;
- reutilizar evidencia vigente;
- detenerse cuando ninguna capability disponible pueda cambiar materialmente la conclusión.

## 8. Construcción schema-aware
Separar la interpretación lógica del request físico. El adapter selecciona la capability, consulta la superficie de `schema.json`, emite sólo campos públicos y deja que el validador específico del motor preserve las restricciones por capability.

No agregar inputs “útiles” por analogía. Por ejemplo, `INTRAMONTH_HISTORY` recibe `start_month`, `end_month` y sus opciones intrames; no recibe `commercial_universe` ni `grain`. Si falta un campo necesario para construir el contrato exacto, devolver clarificación en vez de ejecutar.

## 9. Siguiente pregunta útil
Al terminar, evaluar si la evidencia revela una bifurcación analítica material aún no resuelta.

Puede proponerse una sola siguiente pregunta cuando:
- nace de un hallazgo o incertidumbre observada;
- puede cambiar, localizar o explicar mejor la lectura;
- existe una capability disponible o discovery controlado para investigarla.

No proponer nada si la conclusión está suficientemente cerrada o la continuación no aporta información material.

## Cierre
Antes de sintetizar comprobar:
- dominio(s) correctos;
- scope comercial y organizacional correctos;
- comparabilidad temporal y de negocio;
- nivel de atribución soportado por evidencia;
- ausencia no confundida con cero;
- categoría semántica soportada por evidencia mínima;
- accionabilidad demostrada si se proponen tareas;
- ninguna llamada restante puede cambiar materialmente la respuesta.

La salida final se rige por `render.md` para DISCOVERY o por `synthesis.md` + `presentation.md` para PRODUCTION.
