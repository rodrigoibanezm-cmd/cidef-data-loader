# DEC_V0.1

## OBJETIVO

Definir el Día de Explicación del Cierre (DEC) como indicador/capacidad especializada de Familia 1 — Expectativa de cierre.

Contrato superior: `docs/business-agent/QUESTION_FAMILIES_V0.1.md`.

DEC NO es una familia ni un motor independiente.

## PREGUNTA

¿Desde qué día del mes la evidencia observada permite anticipar o explicar el cierre mensual con un nivel de precisión suficientemente estable?

## PRINCIPIO

DEC DEBE estimarse empíricamente.

NO fijar un día arbitrario.

NO asumir que ventas acumuladas son la única evidencia válida. Familia 1 puede incorporar historia, estacionalidad, ritmo intra-mes y otras señales certificadas disponibles.

## UMBRAL DE PRECISIÓN

El umbral forma parte del contrato del indicador y DEBE validarse con historia.

`90%` es una hipótesis inicial de diseño. NO es un parámetro V0.1 congelado.

La implementación debe definir explícitamente:

- variable objetivo;
- error/métrica de precisión;
- horizonte histórico;
- tamaño mínimo de muestra;
- threshold aceptado;
- estabilidad del threshold.

## NIVELES DE ANÁLISIS

### NIVEL 1 — CIDEF TIENDAS PROPIAS

Calcular línea base corporativa sobre universo certificado de tiendas propias.

### NIVEL 2 — SUCURSAL

Calcular DEC por sucursal cuando exista historia suficiente.

Comparación principal:

```text
DEC_sucursal - DEC_Cidef
```

### NIVEL 3 — VENDEDOR

Calcular SOLO si existe historia y tamaño de muestra suficientes.

Si no se cumplen mínimos estadísticos, devolver `INSUFICIENTE_EVIDENCIA`.

## INDICADORES

### `dec_absoluto`

Primer día del mes en que la capacidad de anticipar/explicar el cierre cumple el threshold validado.

### `dec_relativo`

```text
dec_unidad - dec_Cidef
```

Interpretación:

- valor negativo = resultado se vuelve explicable antes que Cidef;
- valor positivo = resultado se vuelve explicable después que Cidef.

### `estabilidad_dec`

Variabilidad del DEC entre períodos comparables.

DEC promedio sin estabilidad NO implica alta predictibilidad.

## RELACIÓN CON FAMILIA 1

DEC ayuda a responder:

- ¿Cuándo el cierre comienza a ser estadísticamente explicable?
- ¿Qué unidades construyen su resultado antes o después de lo esperable?
- ¿Cuándo una proyección comienza a tener precisión suficiente para gestión?

DEC es evidencia derivada del motor de Expectativa de cierre. NO reemplaza la proyección de cierre.

## RELACIÓN CON FAMILIA 3

DEC puede ser señal auxiliar de Deterioro y red flags cuando existe cambio persistente respecto de la propia historia.

Ejemplo conceptual:

```text
DEC histórico estable
→ DEC comienza a desplazarse hacia fin de mes
→ patrón persiste
→ posible señal de fragilidad
```

Familia 3 debe aplicar su propio contrato de persistencia/clasificación. DEC por sí solo NO declara deterioro.

## INPUT REQUERIDO

- `fact_venta` y/o hechos canónicos requeridos por el modelo de Familia 1;
- métricas certificadas de venta;
- calendario/día del mes;
- MASTER de sucursal/persona;
- historia suficiente;
- universo certificado de tiendas propias cuando corresponda.

Motores NO consumen RAW directamente.

## OUTPUT MÍNIMO

- nivel analizado;
- entidad;
- período histórico;
- `dec_absoluto`;
- `dec_relativo` cuando corresponda;
- `estabilidad_dec`;
- threshold utilizado;
- métrica de precisión;
- tamaño de muestra;
- evidencia de validación;
- gaps/incertidumbre.

## REGLAS

- NO crear motor DEC independiente.
- NO fijar día o threshold sin validación empírica.
- NO asumir que acumulado de ventas es el único predictor.
- NO comparar unidades con universos incompatibles.
- NO calcular nivel vendedor sin muestra suficiente.
- NO interpretar DEC tardío automáticamente como mal desempeño.
- NO usar DEC aislado para declarar deterioro.

## CRITERIO DE CIERRE V0.1

DEC es implementable cuando estén definidos y validados:

- variable objetivo;
- métrica de precisión;
- threshold;
- historia mínima;
- tamaño mínimo de muestra;
- algoritmo para determinar primer día válido;
- estabilidad entre períodos;
- universo de comparación.
