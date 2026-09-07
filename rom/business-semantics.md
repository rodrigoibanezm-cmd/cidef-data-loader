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

## 2. Contrato operacional de conceptos

Cada concepto debe evaluarse con cuatro preguntas:
1. ¿Qué evidencia mínima existe?
2. ¿Contra qué referencia válida se compara?
3. ¿Qué evidencia NO alcanza por sí sola?
4. ¿Cuál es el nivel máximo de conclusión permitido?

### Brecha
**Evidencia mínima**
- resultado observado;
- referencia válida compatible;
- diferencia cuantificable entre ambos.

**Referencias válidas**
- expectativa determinista;
- historia comparable;
- pares estructuralmente equivalentes;
- mercado relevante certificado;
- otra referencia explícitamente compatible.

**No basta**
- diferencia contra un universo no equivalente;
- comparación con período incompleto;
- referencia implícita inventada por el agente.

**Conclusión permitida**
- `brecha favorable`, `brecha adversa` o descripción cuantificada.

Una brecha por sí sola no implica oportunidad, riesgo, causa ni responsabilidad.

### Deterioro
**Evidencia mínima**
- evolución adversa;
- referencia válida;
- soporte temporal o comparativo suficiente para no reducirlo a una variación puntual.

**Referencias válidas**
- trayectoria propia comparable;
- expectativa determinista;
- pares equivalentes;
- mercado relevante compatible.

**No basta**
- una caída aislada;
- un mes incompleto;
- una comparación entre universos no equivalentes;
- una única métrica sin contexto cuando la conclusión depende de varias dimensiones.

**Conclusión permitida**
- `deterioro observado` sólo cuando existe soporte suficiente;
- en caso contrario, describir la variación adversa como `señal`.

### Oportunidad
**Evidencia mínima**
```text
resultado observado
+ referencia válida
+ brecha
+ evidencia de disponibilidad o capturabilidad
```

La disponibilidad puede provenir, según la pregunta, de mercado, demanda CRM, trayectoria, posición relativa u otra evidencia certificada compatible.

**Referencias válidas**
- mercado relevante;
- demanda CRM compatible;
- expectativa determinista;
- trayectoria propia;
- pares equivalentes;
- posición/share compatible.

**No basta**
- mercado creciendo sin evidencia de captura débil;
- leads creciendo sin evidencia de resultado o conversión compatible;
- VIN bajo sin evidencia de disponibilidad;
- una venta que no ocurrió;
- una brecha sin evidencia de capturabilidad.

**Conclusión permitida**
- `oportunidad observada` o `oportunidad no capturada` cuando la combinación está soportada;
- `señal de oportunidad` cuando falta una dimensión necesaria.

Oportunidad no significa venta garantizada ni causalidad demostrada.

### Ventaja
**Evidencia mínima**
- desempeño favorable;
- referencia válida;
- diferencial positivo respecto de esa referencia.

**Referencias válidas**
- mercado;
- historia comparable;
- expectativa;
- pares equivalentes.

**No basta**
- crecer en términos absolutos;
- vender más que otro actor no comparable;
- una mejora sin referencia.

**Conclusión permitida**
- `ventaja observada`.

### Fortaleza
**Evidencia mínima**
- ventaja observada;
- consistencia temporal, repetición o estabilidad suficiente.

**No basta**
- una observación favorable puntual;
- una única comparación aislada.

**Conclusión permitida**
- `fortaleza` sólo cuando la ventaja no es meramente episódica.

### Riesgo
**Evidencia mínima**
- señal adversa actual;
- referencia válida;
- evidencia compatible con posible deterioro futuro de VIN, posición o captura.

Puede apoyarse en desaceleración persistente, pérdida relativa, deterioro frente a historia/pares, debilitamiento de demanda/gestión u otras señales certificadas.

**No basta**
- una caída puntual;
- una única métrica adversa;
- una correlación aislada;
- una interpretación causal no demostrada.

**Conclusión permitida**
- `riesgo` cuando existe soporte suficiente;
- `señal de riesgo` cuando falta persistencia o evidencia complementaria.

Riesgo no significa que el deterioro ocurrirá.

### Red flag
**Evidencia mínima**
- señal excepcional o material;
- criterio determinista explícito de materialidad, persistencia, excepcionalidad o condición habilitante.

**No basta**
- que una métrica "se vea mala";
- una caída porcentual sin threshold certificado;
- una anomalía subjetiva;
- una brecha no materializada.

**Conclusión permitida**
- `red flag` sólo con criterio explícito.
- Sin ese criterio: usar `señal`, `brecha`, `deterioro observado` o `riesgo`.

### Prioridad
**Evidencia mínima**
- oportunidad, riesgo, brecha o problema sustentado;
- relevancia para resultado;
- accionabilidad identificable;
- base válida para comparar frente a otros hallazgos.

**No basta**
- una señal interesante;
- una lista ordenada subjetivamente;
- inventar scores, pesos, Pareto o thresholds.

**Conclusión permitida**
- `prioridad` sólo si existe criterio suficiente para hacer competir ese foco por atención operativa.

### Señal
**Evidencia mínima**
- evidencia observable real.

**Uso**
- cuando existe algo digno de seguimiento, pero no soporte suficiente para una categoría más fuerte.

**Conclusión permitida**
- `señal`, sin elevarla artificialmente.

### Accionabilidad
**Evidencia mínima**
- ámbito de intervención identificable dentro de CIDEF;
- relación clara entre el hallazgo y una acción posible;
- la acción no requiere asumir causalidad no demostrada.

**No basta**
- que el fenómeno sea material;
- que exista una brecha;
- que el agente pueda imaginar una tarea.

**Conclusión permitida**
- una acción concreta y proporcional al nivel de certeza disponible.

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

Ejemplo conceptual de ventaja:
```text
resultado favorable
+ referencia válida
+ diferencial positivo
→ ventaja observada
```

Ejemplo conceptual de fortaleza:
```text
ventaja observada
+ persistencia / repetición
→ fortaleza
```

Ejemplo conceptual de riesgo:
```text
señal adversa
+ referencia válida
+ persistencia o evidencia complementaria
→ riesgo
```

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

Si el usuario pide N tareas y sólo existen M focos sustentados, con `M < N`, entregar sólo M y explicitar que no existe evidencia suficiente para completar N sin inventar prioridades.
