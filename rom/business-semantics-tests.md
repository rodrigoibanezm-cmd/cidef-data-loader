# Pruebas conceptuales — Semántica analítica CIDEF

Objetivo: validar que `business-semantics.md` permita responder preguntas ejecutivas sin convertir métricas aisladas en diagnósticos fuertes ni inventar prioridades.

Estas pruebas no reemplazan tests de motores. Validan el flujo semántico esperado del agente sobre evidencia determinista compatible.

## Caso 1 — ¿Qué tienda está perdiendo oportunidad de captura?

### Intención
Identificar una tienda propia donde exista evidencia de resultado no capturado respecto de disponibilidad observable.

### Evidencia mínima esperada
VENTAS:
- VIN observados por tienda en período comparable;
- trayectoria o brecha frente a referencia válida.

RVM:
- mercado relevante para la marca/producto aplicable;
- evolución o posición compatible con el período.

CRM:
- demanda observable compatible para la tienda;
- volumen y/o conversión/gestión cuando corresponda.

### Regla semántica
No basta con `VIN ↓`.

Una conclusión de oportunidad de captura requiere, conceptualmente:
```text
captura relativa débil
+ disponibilidad observable en mercado y/o demanda
+ referencia compatible
→ oportunidad no capturada
```

### Casos esperados
A. VIN cae, mercado crece y CRM muestra demanda disponible compatible.
→ Puede sostener `oportunidad no capturada` si la brecha está sustentada.

B. VIN cae, mercado cae y CRM también cae.
→ No sostener oportunidad perdida sólo por la caída de VIN.

C. VIN cae, mercado crece, pero CRM no es evaluable.
→ Mantener como `señal de oportunidad` o conclusión parcial; no completar CRM por inferencia.

### Fallos prohibidos
- declarar oportunidad porque una tienda vendió menos;
- usar RVM total como penetración propia/dealer sin denominador compatible;
- mezclar OWN_STORES con DEALERS;
- atribuir causa a mala gestión desde conversión baja.

---

## Caso 2 — ¿Dónde tenemos una ventaja que deberíamos proteger?

### Intención
Identificar desempeño favorable diferencial y decidir si alcanza para llamarlo ventaja o fortaleza.

### Evidencia mínima esperada
- resultado observado;
- referencia válida compatible;
- diferencial favorable;
- historia adicional si se pretende elevar de ventaja a fortaleza.

### Regla semántica
```text
resultado favorable
+ referencia válida
+ diferencial positivo
→ ventaja observada
```

Para fortaleza:
```text
ventaja observada
+ persistencia / repetición
→ fortaleza
```

### Casos esperados
A. Una tienda crece 15% y sus pares equivalentes crecen 5%.
→ Puede sostener `ventaja observada` si universos/períodos son compatibles.

B. Una tienda crece 15% pero no existe referencia válida.
→ Describir crecimiento; no llamarlo ventaja.

C. Una marca supera consistentemente al mercado relevante durante múltiples períodos comparables.
→ Puede sostener `fortaleza` si la persistencia está explícitamente evidenciada.

### Fallos prohibidos
- llamar ventaja a cualquier crecimiento positivo;
- llamar fortaleza a un único mes favorable;
- comparar actores no equivalentes.

---

## Caso 3 — Dame 5 tareas para esta semana para la sucursal de Vicuña Mackenna

### Intención
Transformar hallazgos sustentados en acciones operativas concretas para una tienda propia.

### Flujo esperado
1. Diagnosticar con evidencia compatible de VENTAS, RVM y/o CRM según cada foco.
2. Clasificar cada hallazgo con la categoría semántica máxima permitida: señal, brecha, deterioro, oportunidad, riesgo, ventaja, fortaleza.
3. Verificar accionabilidad.
4. Proponer tareas sólo sobre focos sustentados.
5. No completar artificialmente la cantidad solicitada.

### Evidencia que puede habilitar tareas
- oportunidades CRM abiertas con ámbito de intervención identificable;
- modelos/marcas con demanda observable y captura relativa débil;
- deterioro persistente localizado por tienda/marca/vendedor cuando sea evaluable;
- ventajas observadas que puedan protegerse mediante acciones concretas;
- señales suficientemente específicas para seguimiento.

### Ejemplo conceptual válido
Evidencia:
- mercado relevante de un modelo crece;
- CRM muestra demanda compatible en Vicuña Mackenna;
- captura/VIN de la tienda queda bajo referencia;
- existen oportunidades abiertas identificables.

Conclusión:
→ `oportunidad no capturada`.

Acción proporcional:
→ revisar y gestionar las oportunidades abiertas de ese modelo durante la semana.

La acción no afirma que la falta de gestión causó la brecha; actúa sobre un ámbito controlable respaldado por evidencia.

### Ejemplo conceptual inválido
Evidencia:
- VIN de un modelo cae un mes.

Conclusión incorrecta:
→ `red flag`.

Tarea incorrecta:
→ cambiar estrategia comercial del modelo.

Falta materialidad/persistencia, referencia y evidencia suficiente para esa intensidad de conclusión/acción.

### Regla de cantidad
Si se solicitan 5 tareas y sólo existen 3 focos sustentados y accionables:
→ entregar 3 tareas.
→ indicar que no existe evidencia suficiente para completar 5 sin inventar prioridades.

### Fallos prohibidos
- inventar una tarea para completar el número pedido;
- proponer acciones sobre fenómenos no accionables;
- convertir asociación en causalidad;
- usar una `red flag` sin criterio determinista explícito;
- reconstruir evidencia ausente desde contexto o memoria.

## Resultado de la prueba conceptual
Los tres flujos son expresables con la semántica actual si el agente recibe evidencia determinista suficiente y compatible.

El principal límite restante no es semántico sino de disponibilidad/orquestación de evidencia: para responder bien, el sistema debe seleccionar las capabilities necesarias y preservar compatibilidad de dominio, universo, período y referencia.
