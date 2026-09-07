# Semántica analítica CIDEF

Autoridad para convertir evidencia analítica válida en conceptos de negocio. No redefine cálculos, identidad, universos, pertenencia, métricas ni thresholds deterministas.

## 1. Principio
Los motores producen evidencia. Este documento define qué conclusiones de negocio permite esa evidencia.

Flujo:
```text
evidencia determinista
→ referencia válida
→ brecha o trayectoria
→ concepto de negocio
→ síntesis / acción
```

No usar una etiqueta de negocio porque una métrica aislada "parezca" buena o mala. Cuando una conclusión requiera materialidad, persistencia o umbral y éstos no estén certificados por un motor o regla determinista, mantener una formulación descriptiva y no elevar la señal.

## 2. Conceptos canónicos

### Brecha
Diferencia cuantificable entre un resultado observado y una referencia válida: expectativa, historia comparable, pares equivalentes, mercado relevante u otra referencia certificada.

Una brecha describe diferencia; por sí sola no implica oportunidad, riesgo, causa ni responsabilidad.

### Deterioro
Evidencia de empeoramiento respecto de una referencia válida y con soporte temporal o comparativo suficiente para no reducirlo a una variación puntual.

No basta:
- una caída aislada;
- un mes incompleto;
- una comparación entre universos no equivalentes;
- una única métrica sin contexto cuando la conclusión depende de varias dimensiones.

Si sólo existe una variación adversa puntual, describir la variación y no llamarla deterioro.

### Oportunidad
Evidencia de resultado potencial adicional observable pero no capturado completamente.

Normalmente requiere:
```text
resultado observado
+ referencia válida
+ brecha
+ evidencia de disponibilidad o capturabilidad
```

La disponibilidad puede provenir, según la pregunta, de mercado, demanda CRM, trayectoria, posición relativa u otra evidencia certificada compatible.

Oportunidad no significa venta garantizada ni causalidad demostrada.

### Ventaja
Desempeño favorable y diferencial respecto de una referencia válida.

No basta con crecer: debe existir evidencia de superioridad relativa frente a mercado, historia, expectativa o pares comparables.

### Fortaleza
Ventaja respaldada por consistencia temporal, repetición o estabilidad suficiente en la evidencia disponible.

Una observación favorable puntual puede ser una ventaja observada, pero no necesariamente una fortaleza.

### Riesgo
Evidencia actual compatible con deterioro futuro de VIN o pérdida de posición/captura.

Puede apoyarse en desaceleración persistente, pérdida relativa, deterioro frente a historia/pares, debilitamiento de demanda/gestión u otras señales certificadas.

Riesgo no significa que el deterioro ocurrirá. No convertir asociación en predicción causal.

### Red flag
Señal suficientemente excepcional o material como para justificar atención prioritaria inmediata.

No declarar `red flag` salvo que la materialidad, persistencia, excepcionalidad o condición habilitante esté sustentada por evidencia o criterio determinista explícito.

Sin ese criterio, usar `señal`, `brecha`, `deterioro observado` o `riesgo` según corresponda.

### Prioridad
Oportunidad, riesgo o problema que merece competir por atención operativa frente a otros hallazgos.

Debe combinar evidencia suficiente con relevancia para resultado y accionabilidad. No inventar scores, pesos, Pareto ni thresholds para ordenar prioridades si no están disponibles determinísticamente.

### Señal
Evidencia observable que puede justificar investigación o seguimiento, pero que todavía no alcanza una categoría más fuerte.

Usar `señal` cuando existe evidencia real pero no soporte suficiente para declarar deterioro, riesgo, oportunidad o red flag.

### Accionabilidad
Grado en que la evidencia permite identificar una intervención concreta dentro del ámbito controlable de CIDEF.

Una observación puede ser material sin ser accionable. No convertir automáticamente un hallazgo en tarea.

## 3. Reglas de combinación

No inferir automáticamente:
```text
VIN ↓        ≠ deterioro
share ↓      ≠ red flag
mercado ↑    ≠ oportunidad
ventas ↑     ≠ ventaja
leads ↑      ≠ oportunidad capturable
conversión ↓ ≠ mala gestión
```

Las conclusiones fuertes requieren evidencia compatible entre dominios cuando la pregunta lo exija.

Ejemplo conceptual de oportunidad de captura:
```text
mercado disponible o creciente
+ demanda observable
+ captura relativa débil
→ evidencia compatible con oportunidad no capturada
```

Si mercado, demanda y resultado se deterioran conjuntamente, no declarar oportunidad perdida sólo desde la caída de VIN.

## 4. Referencias válidas
Una referencia debe ser compatible con la métrica, universo, período y nivel organizacional analizados.

Referencias posibles:
- historia propia comparable;
- expectativa determinista;
- pares estructuralmente equivalentes;
- mercado relevante certificado;
- participación o posición compatible;
- demanda CRM compatible.

Las reglas de compatibilidad física, temporal y de pertenencia viven en MASTER, `business-rules.md` y motores deterministas.

## 5. Nivel de conclusión
Mantener la conclusión en el nivel realmente soportado por la evidencia.

```text
hecho observado
→ señal
→ brecha / ventaja / deterioro
→ oportunidad / riesgo / fortaleza
→ red flag / prioridad
```

La secuencia no es obligatoria, pero las categorías más fuertes requieren más evidencia, no menos.

Cuando falte evidencia necesaria: `NO_SABEMOS`, `NO_EVALUABLE` o una formulación descriptiva equivalente.

## 6. De diagnóstico a acción
Las familias y motores no necesitan generar tareas comerciales. Entregan evidencia y diagnósticos deterministas.

El agente puede proponer una acción sólo cuando:
- la evidencia soporta el concepto de negocio utilizado;
- existe un ámbito de intervención identificable;
- la acción no supone una causa no demostrada;
- la acción es proporcional al nivel de certeza disponible.

Una tarea debe atacar una oportunidad, riesgo, brecha o señal sustentada; nunca existir sólo porque el agente necesita completar una lista.
