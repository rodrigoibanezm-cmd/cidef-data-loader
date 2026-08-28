# COMMERCIAL_RED_FLAGS_V0.1

## OBJETIVO

Definir contrato analítico especializado para Familia 3 — Deterioro y red flags.

Detectar señales adversas antes de que el deterioro sea evidente en el resultado mensual.

Contrato superior: `docs/business-agent/QUESTION_FAMILIES_V0.1.md`.

## PRINCIPIO

Resultado final y salud comercial NO son equivalentes.

El motor debe analizar cómo se construye el resultado y distinguir:

- ruido;
- anomalía puntual;
- cambio persistente;
- deterioro estructural.

Una red flag DEBE ser una señal observable anterior o adicional al resultado final. NO es simplemente una venta baja.

## INPUT REQUERIDO

- hechos canónicos comerciales/operacionales;
- métricas certificadas;
- historia suficiente para construir línea base;
- dimensiones conformadas de persona/sucursal/producto cuando correspondan;
- comparables válidos cuando el análisis sea relativo.

Motores NO consumen RAW directamente.

## PREGUNTAS

- ¿Quién se está deteriorando respecto de su propia historia?
- ¿Desde cuándo comenzó el deterioro?
- ¿Cuál fue la primera señal observable?
- ¿Qué cambios pequeños pero anormales preceden una caída de resultado?
- ¿Quién depende sistemáticamente de los últimos días del mes?
- ¿Quién presenta volatilidad anormal?
- ¿Dónde aumentan NV sin factura o procesos envejecidos?
- ¿Dónde están aumentando los tiempos de conversión?
- ¿Quién parece saludable por resultado final pero muestra fragilidad?
- ¿Qué patrones han precedido deterioros anteriores?

## UNIDAD DE ANÁLISIS

Candidatos según pregunta:

- vendedor;
- sucursal;
- producto/familia;
- proceso comercial;
- combinación validada de dimensiones.

La unidad debe compararse contra una línea base compatible con su contexto.

## SEÑALES V0.1

### CONCENTRACIÓN DE CIERRES

Medir proporción de ventas concentrada en ventanas finales del mes, por ejemplo:

- últimos 10 días;
- últimos 7 días;
- últimos 5 días.

Interpretar SOLO contra historia propia y/o comparables válidos.

Concentración alta aislada NO implica deterioro.

### DEPENDENCIA DE RESCATE FIN DE MES

Detectar patrón repetido:

```text
ritmo bajo durante mes
→ recuperación concentrada al cierre
→ repetición histórica
```

La repetición es evidencia más fuerte que un evento aislado.

### VOLATILIDAD

Medir desviación del comportamiento mensual respecto de línea base histórica.

Alta volatilidad puede indicar fragilidad/predictibilidad baja. NO equivale automáticamente a mal desempeño.

### NV SIN FACTURA

Medir:

- unidades abiertas;
- antigüedad;
- distribución de aging;
- tasa histórica de conversión;
- desviación respecto de historia/comparables.

### TIEMPO NV → FACTURA

Detectar incremento persistente del tiempo de conversión respecto de línea base.

### PROCESOS ENVEJECIDOS

Detectar unidades reservadas o en etapas previas al cierre que exceden comportamiento histórico esperado sin avanzar.

### DETERIORO VS HISTORIA PROPIA

Comparar, cuando existan métricas certificadas:

- ritmo acumulado;
- resultado mensual;
- concentración temporal;
- volatilidad;
- tiempos de conversión;
- aging operacional.

### DETERIORO VS COMPARABLES

Comparar SOLO contra unidades equivalentes bajo criterios explícitos.

NO usar promedio global si mezcla contextos incompatibles.

## CLASIFICACIÓN DE SEÑAL

El motor DEBE clasificar la evidencia al menos como:

```text
NORMAL
ANOMALÍA_PUNTUAL
CAMBIO_PERSISTENTE
DETERIORO
INSUFICIENTE_EVIDENCIA
```

La clasificación debe derivarse de reglas deterministas y parámetros explícitos.

## PERSISTENCIA

Una señal gana fuerza cuando presenta:

- duración;
- repetición;
- magnitud creciente;
- consistencia entre métricas relacionadas;
- diferencia respecto de historia propia;
- diferencia respecto de comparables válidos.

NO convertir un único período adverso en deterioro estructural sin regla que lo soporte.

## DETECCIÓN TEMPRANA

Objetivo prioritario: identificar señales que aparezcan ANTES del deterioro final.

Cuando exista historia suficiente, validar retrospectivamente:

```text
señal en t-n
→ deterioro posterior en t
```

El patrón debe mostrar recurrencia suficiente antes de incorporarse como red flag certificada.

Correlación histórica NO demuestra causalidad.

## OUTPUT MÍNIMO

Por señal detectada:

- entidad/unidad afectada;
- tipo de señal;
- clasificación;
- fecha/período de inicio;
- magnitud;
- persistencia;
- línea base usada;
- comparable usado cuando corresponda;
- métricas/evidencia que soportan la señal;
- primera evidencia observable cuando pueda determinarse;
- gaps/incertidumbre.

## REGLAS

- NO consumir RAW directamente.
- NO redefinir métricas certificadas.
- NO declarar deterioro solo por resultado bajo.
- NO comparar contextos incompatibles.
- NO interpretar volatilidad o cierre tardío automáticamente como mal desempeño.
- NO afirmar causalidad sin evidencia específica.
- Si historia o comparable son insuficientes, devolver `INSUFICIENTE_EVIDENCIA`.

## DEPENDENCIAS

```text
MASTER
→ hechos canónicos
→ métricas certificadas
→ marts/cubos opcionales
→ motor Familia 3
```

## CRITERIO DE CIERRE V0.1

El contrato es implementable cuando:

- métricas requeridas están certificadas;
- línea base histórica está definida;
- criterios de comparabilidad están definidos;
- thresholds/reglas de clasificación son explícitos;
- señales candidatas pueden validarse retrospectivamente.
