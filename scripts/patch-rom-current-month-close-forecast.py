import json
from pathlib import Path

ACTION = 'current_month_close_forecast_v01'

schema_path = Path('rom/schema.json')
schema = json.loads(schema_path.read_text())
version = [int(x) for x in schema['info']['version'].split('.')]
version[1] += 1
version[2] = 0
schema['info']['version'] = '.'.join(map(str, version))

actions = schema['components']['schemas']['CustomGptRequest']['properties']['action']['enum']
if ACTION not in actions:
    anchor = actions.index('daily_close_forecast_v01') + 1
    actions.insert(anchor, ACTION)

action_input = schema['components']['schemas']['ActionInput']
desc = action_input['description']
note = (
    ' current_month_close_forecast_v01 requires cutoff_date, rejects future dates, uses cutoff-safe '
    'recognized CIDEF sales plus prior closed-month same-day median completion, densifies the current '
    "tipo_canal='CIDEF' roster with LIVE_ZERO, and returns forecast_close plus V0.1 predictability status."
)
if f'{ACTION} requires' not in desc:
    action_input['description'] = desc + note
schema_path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + '\n')

motors_path = Path('rom/motors.md')
text = motors_path.read_text()
heading = f'### `{ACTION}`'
marker = '### `predictability_day_v01`'
section = '''### `current_month_close_forecast_v01`

Motor determinista **live/as-of** para Familia 1 — EXPECTATIVA Y CIERRE. Versión interna: `0.1`.

Pregunta:

> Con la evidencia disponible al `cutoff_date`, ¿cuánto debería cerrar el mes y el forecast ya está dentro de la zona históricamente predecible?

Input:

```text
cutoff_date: YYYY-MM-DD
```

El cutoff no puede estar en el futuro. V0.1 acepta un cutoff histórico para reproducibilidad, pero su uso productivo es el mes abierto actual.

Dependencias compartidas:

```text
ventas_context_v01 cutoff-safe
ventas_daily_organizational_context_v01 semantics
learnCurrentCompletion
walk-forward forecast helpers
predictability_day V0.1 rule
sucursales_master current tipo_canal='CIDEF' roster
```

Reglas:

```text
learned_completion
= median completion_ratio de meses cerrados < target_month
  en el mismo calendar day

forecast_close
= observed_to_date / learned_completion
```

Si `learned_completion <= 0`, `forecast_status=NOT_EVALUABLE` y `forecast_close=null`.

`is_predictable` no controla si existe forecast: sólo indica si `day_of_month >= predictability_day` bajo la regla V0.1 `median APE <=20%` + `p90 APE <=40%` persistente.

Universo live tienda:

```text
todas las sucursales actuales sucursales_master.tipo_canal='CIDEF'
```

Una tienda del roster sin venta reconocida al cutoff se emite con:

```text
observed_to_date = 0
observation_semantics = LIVE_ZERO
```

Esto es deliberadamente distinto del contexto histórico sparse-positive: el roster actual es evidencia disponible para control live.

Output principal:

```text
as_of
cidef_propio:
  observed_to_date
  learned_completion
  historical_observations
  forecast_close
  forecast_status
  predictability_day
  is_predictable

tienda_propia[]:
  sucursal_id
  sucursal
  observation_semantics
  observed_to_date
  learned_completion
  historical_observations
  forecast_close
  forecast_status
  predictability_day
  is_predictable
```

Validaciones principales:

```text
source_daily_organizational_context_ok
source_history_context_ok
learned_completion_*_in_bounds
historical_completion_observations_available
*_forecast_formula_reconciles
cidef_owned_reconciles_with_live_roster
current_cidef_roster_complete
current_roster_channels_valid
predictability_day_available
```

No calcula alertas, metas, scores, rankings ni modelos alternativos. Persistencia exclusivamente runtime.
'''
if heading not in text:
    if marker not in text:
        raise SystemExit('motors insertion marker not found')
    motors_path.write_text(text.replace(marker, section + '\n\n' + marker, 1))
