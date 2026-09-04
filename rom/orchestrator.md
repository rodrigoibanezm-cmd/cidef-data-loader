# Orquestador analítico — CIDEF

## Propósito

Este documento gobierna cómo el agente transforma una pregunta en una secuencia de capabilities públicas.

No define métricas, identidad ni cálculos. No reemplaza `schema.json`. Coordina capacidades existentes.

## Principio rector

**Partir del universo más amplio que sea pertinente y reducirlo sólo cuando la evidencia justifique bajar de nivel.**

Secuencia conceptual:

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
Requiere comparación, trayectoria, evaluación, explicación, diagnóstico u oportunidad.

Ejemplos:
- ¿Cómo está Bellavista?
- ¿Dongfeng está perdiendo terreno?
- ¿Qué vendedores vienen deteriorándose?
- ¿Qué explica el movimiento?

→ obtener primero el contexto que pueda cambiar la interpretación.

## 2. Big picture

El big picture combina, cuando sea pertinente:

```text
VENTAS → VIN propios CIDEF
RVM    → mercado / share / posición
CRM    → demanda / gestión / conversión
```

No llamar las tres fuentes por rutina. Usar sólo las necesarias para la pregunta.

Cuando la evolución temporal sea material, LONGITUDINAL es la fuente de contexto temporal.

El big picture sirve para interpretar. No demuestra causalidad ni sustituye una capability diagnóstica específica.

## 3. Reducir el universo

Después del contexto, bajar al siguiente nivel sólo si ayuda a responder la pregunta.

Ejemplo comercial:

```text
CIDEF
→ marca
→ tienda
→ vendedor
→ producto/modelo
```

Ejemplo competitivo:

```text
mercado
→ segmento/marca
→ modelo
→ competidor
→ geografía, si corresponde
```

No comenzar por vendedor/modelo si el fenómeno todavía no está localizado en el nivel superior, salvo que el usuario haya pedido explícitamente ese universo.

## 4. Múltiples capabilities

Una pregunta puede requerir varias llamadas.

Reglas de coordinación:

- evidencia base antes que evidencia derivada;
- una llamada debe reducir incertidumbre, reducir universo o validar una interpretación;
- no ejecutar una llamada que no pueda cambiar la respuesta;
- llamadas dependientes se resuelven en secuencia;
- llamadas independientes pueden resolverse sin dependencia entre sí;
- reutilizar evidencia ya obtenida cuando conserve el mismo universo y corte temporal;
- detenerse cuando exista evidencia suficiente.

## 5. Dominios públicos

### SALES
Resultado comercial CIDEF: VIN, cierre, producto, tienda, vendedor, concentración, contribución, desempeño y deterioro.

### MARKET
Mercado/RVM: contexto competitivo, share, trayectoria, relaciones e historia de mercado.

### DISCOVERY
Inspección controlada de datos. Usar cuando una capability no existe o debe validarse. No reconstruir manualmente una lógica que ya tenga capability AVAILABLE.

### LONGITUDINAL
Contexto temporal normalizado de VENTAS, RVM y CRM.

`schema.json` es la autoridad sobre qué capabilities existen y qué inputs aceptan.

## 6. Compatibilidad temporal

Antes de integrar fuentes, verificar que sus períodos sean comparables.

Respetar:
- período completo/incompleto;
- `lastObservedDate`;
- `effectiveDateTo`;
- semántica SAME_DAY.

SAME_DAY compara igual posición de calendario; no reconstruye el estado histórico as-of.

Si las fuentes tienen cortes distintos, usar el mínimo corte común cuando la comparación lo requiera o declarar la limitación.

## 7. Criterio de salida

Antes de responder comprobar:

```text
¿Tengo contexto suficiente para interpretar?
¿Localicé el fenómeno al nivel necesario?
¿Otra capability podría cambiar materialmente la conclusión?
```

Si la última respuesta es no, detener llamadas y renderizar.

La salida final se rige por `render.md` o `render-production.md` según fase y audiencia.
