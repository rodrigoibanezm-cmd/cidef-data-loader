import json
from pathlib import Path

ACTION = 'daily_close_forecast_backtest_v01'

schema_path = Path('rom/schema.json')
schema = json.loads(schema_path.read_text())
version = [int(x) for x in schema['info']['version'].split('.')]
version[1] += 1
version[2] = 0
schema['info']['version'] = '.'.join(map(str, version))
actions = schema['components']['schemas']['CustomGptRequest']['properties']['action']['enum']
if ACTION not in actions:
    anchor = actions.index('daily_close_backtest_context_v01') + 1
    actions.insert(anchor, ACTION)
desc = schema['components']['schemas']['ActionInput']['description']
note = (
    ' daily_close_forecast_backtest_v01 requires start_month and end_month and returns a compact '
    'walk-forward forecast-error summary by calendar day for CIDEF_PROPIO and pooled TIENDA_PROPIA. '
    'V0.1 uses only median completion from strictly prior months, includes zero completion in training, '
    'marks learned median <= 0 as NOT_EVALUABLE, and does not define PREDICTABILITY_DAY or thresholds.'
)
if f'{ACTION} requires' not in desc:
    schema['components']['schemas']['ActionInput']['description'] = desc + note
schema_path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + '\n')

motors_path = Path('rom/motors.md')
text = motors_path.read_text()
heading = f'### `{ACTION}`'
marker = '### `ventas_product_sales_v01`'
section = '''### `daily_close_forecast_backtest_v01`

Motor determinista compacto de **backtest de cierre diario** para Familia 1 — EXPECTATIVA Y CIERRE. Versión interna: `0.1`.

Pregunta:

> ¿Cuánto error histórico produce cada día calendario si el cierre se estima usando la mediana de completion observada exclusivamente en meses anteriores?

Inputs obligatorios:

```text
start_month: YYYY-MM
end_month: YYYY-MM
```

Ambos targets deben ser meses cerrados. La historia de training se deriva automáticamente desde la primera `fecha_factura` parseable disponible hasta cada target.

Dependencia principal:

```text
daily_close_backtest_context_v01
```

V0.1 fija una sola baseline:

```text
completion_ratio = observed_to_date / actual_close
learned_completion(M,d) = median(completion_ratio de observaciones con month < M y mismo calendar day d)
forecast_close(M,d) = observed_to_date(M,d) / learned_completion(M,d)
```

Los `completion_ratio=0` históricos **sí participan** en la mediana. Si la mediana aprendida es `<=0`, el target queda `NOT_EVALUABLE`; no usa epsilon ni imputación.

Grains:

```text
CIDEF_PROPIO
TIENDA_PROPIA_POOLED
```

TIENDA V0.1 no segmenta por volumen ni usa `actual_close` del target para seleccionar buckets. `actual_close` participa únicamente como label para calcular error después del forecast.

Output compacto `candidate_results[]`, máximo una fila por `grain × day_of_month`, con:

```text
grain
candidate = median_completion_all_prior
day_of_month
target_observations
targets_evaluable
targets_not_evaluable
training_observations_min
training_observations_max
mape_pct
median_ape_pct
p75_ape_pct
p90_ape_pct
mean_signed_error_pct
```

Los errores están expresados en porcentaje, no fracción.

Validaciones principales:

```text
underlying_context_ok
training_precedes_target
learned_completion_in_bounds
forecast_only_when_completion_positive
forecast_formula_reconciles
signed_error_reconciles
absolute_error_reconciles
summary_counts_reconcile
no_nonfinite_evaluable_values
target_actual_close_not_used_in_forecast
no_store_volume_segmentation
```

El motor no devuelve miles de forecasts individuales y no calcula `PREDICTABILITY_DAY`, threshold de precisión, alerta ni estado live. Su responsabilidad termina en error histórico compacto por día.
'''
if heading not in text:
    if marker not in text:
        raise SystemExit('motors insertion marker not found')
    motors_path.write_text(text.replace(marker, section + '\n\n' + marker, 1))
