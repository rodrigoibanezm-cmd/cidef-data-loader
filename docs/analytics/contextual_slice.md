# Motor `contextual_slice`

## Propósito

`contextual_slice` entrega a un LLM un dato agregado junto con el contexto mínimo necesario para interpretarlo correctamente.

El problema que resuelve es evitar respuestas basadas en un valor aislado. Por ejemplo, `15 ventas` puede ser una señal positiva si el promedio histórico era 10, o negativa si el promedio histórico era 20.

La arquitectura separa dos responsabilidades:

- el cubo define **qué corte se está observando**;
- `contextual_slice` entrega **cómo debe interpretarse ese corte en su propio contexto histórico**.

El contexto se calcula **on demand**. No se materializan todas las combinaciones posibles de dimensiones.

---

## Cubos soportados

### `rvm`

Fuente: `rvm_raw`.

Medida actual: unidades, usando `COALESCE(cantidad, 1)`.

Dimensiones permitidas:

- `region`
- `comuna`
- `tipo`
- `segmento`
- `marca`
- `modelo`
- `version`
- `combustible`
- `ano_fabricacion`
- `pais_vin`
- `preinscrito`
- `prenda`

Fecha utilizada: `fecha`.

### `inventario`

Fuente: `inventario_vehiculos_global_raw`.

Medida actual: conteo de vehículos.

Dimensiones permitidas:

- `marca`
- `modelo`
- `ano`
- `ano_fabricacion`
- `etapa`
- `bodega`
- `vigente`
- `vendedor`
- `sucursal`
- `dealer`
- `dealer_rut`
- `es_dealer`
- `dealer_venta`
- `tipo_motor`
- `tipo_ficha`
- `norma`
- `en_patio`
- `reservado`
- `en_transito`
- `pendiente_entrega`

La fecha mensual se obtiene, en este orden, desde:

1. `fecha_factura`
2. `fecha_nv`
3. `fecha_ingreso_stk`

Solo se consideran valores con formato de fecha reconocible por el motor.

---

## Contrato de entrada

```json
{
  "cube": "rvm",
  "period": "2026-08",
  "filters": {
    "region": "VI REGIÓN",
    "marca": "DONGFENG"
  }
}
```

También se acepta `dimensions` como alias de `filters`.

### Reglas

- `cube` debe ser `rvm` o `inventario`.
- `period` debe usar formato `YYYY-MM`.
- los filtros solo pueden usar dimensiones declaradas en la whitelist del cubo;
- un filtro puede contener un valor o una lista de valores;
- el motor no acepta nombres de tabla, columnas ni SQL suministrados por el usuario.

---

## Contrato de salida

La respuesta está diseñada para consumo por LLM, no como tabla de presentación humana.

```json
{
  "cube": "rvm",
  "focus": {
    "period": "2026-08",
    "filters": {
      "region": "VI REGIÓN",
      "marca": "DONGFENG"
    }
  },
  "measure": {
    "name": "units",
    "value": 15
  },
  "context": {
    "self_history": {
      "previous_period": {
        "period": "2026-07",
        "value": 12
      },
      "same_period_last_year": {
        "period": "2025-08",
        "value": 9
      },
      "avg_3m": 11.67,
      "avg_12m": 10.42,
      "delta_vs_avg_3m_pct": 28.53,
      "delta_vs_avg_12m_pct": 43.95,
      "delta_yoy_pct": 66.67,
      "trend_6m": {
        "direction": "up",
        "slope": 0.8
      }
    },
    "distribution": {
      "n": 24,
      "min": 6,
      "p25": 8.75,
      "median": 10,
      "p75": 12.25,
      "max": 16,
      "mean": 10.46
    },
    "history": [
      {
        "period": "2025-08",
        "value": 9
      }
    ]
  },
  "meta": {
    "generated_on_demand": true,
    "history_window_months": 24,
    "allowed_dimensions": ["region", "marca"]
  }
}
```

---

## Contexto generado

Para el mismo corte solicitado, el motor calcula:

- valor del período actual;
- período histórico anterior disponible;
- mismo período del año anterior;
- promedio de los últimos 3 períodos disponibles;
- promedio de los últimos 12 períodos disponibles;
- desviación porcentual contra ambos promedios;
- variación interanual;
- tendencia lineal sobre hasta 6 períodos anteriores;
- distribución histórica: mínimo, p25, mediana, p75, máximo y promedio;
- serie histórica de hasta 24 meses anteriores y el período actual.

La tendencia se clasifica como `up`, `down`, `flat` o `insufficient_data`.

---

## Principio de uso por agentes

El agente no debería interpretar un valor del cubo sin contexto cuando la comparación histórica sea relevante.

Flujo esperado:

`pregunta → selección del cubo/corte → contextual_slice → interpretación LLM → siguiente drill-down`

Cada drill-down genera un nuevo contexto para el nuevo corte. El contexto anterior no se reutiliza como si describiera el nuevo nivel de agregación.

Ejemplos:

- una tienda se interpreta contra su propia historia;
- un vendedor se interpreta contra la historia de ese vendedor;
- una marca/región se interpreta contra la historia exacta de esa combinación;
- un modelo/dealer se interpreta contra la historia exacta de ese slice.

---

## Alcance actual

La versión actual entrega principalmente **contexto longitudinal del propio slice**.

Todavía no incluye de forma genérica:

- peer groups;
- ranking contra pares;
- percentil transversal entre miembros de una dimensión;
- selección automática de benchmark competitivo;
- share o medidas distintas de unidades;
- relaciones automáticas entre los cubos RVM e inventario.

Esas capacidades deben agregarse explícitamente cuando su semántica esté definida. No deben inferirse dentro del LLM.

---

## Implementación

Motor: `lib/motors/contextual-slice.js`

Registro: `contextual_slice` en `lib/motors/index.js`.

El motor es de solo lectura y construye las consultas desde configuraciones y dimensiones previamente autorizadas.