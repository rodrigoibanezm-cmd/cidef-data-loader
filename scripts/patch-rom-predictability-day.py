import json
from pathlib import Path

ACTION = 'predictability_day_v01'

schema_path = Path('rom/schema.json')
schema = json.loads(schema_path.read_text())
version = [int(x) for x in schema['info']['version'].split('.')]
version[1] += 1
version[2] = 0
schema['info']['version'] = '.'.join(map(str, version))

actions = schema['components']['schemas']['CustomGptRequest']['properties']['action']['enum']
if ACTION not in actions:
    anchor = actions.index('daily_close_forecast_backtest_v01') + 1
    actions.insert(anchor, ACTION)

action_input = schema['components']['schemas']['ActionInput']
desc = action_input['description']
note = (
    ' predictability_day_v01 requires start_month and end_month, accepts optional '
    'median_ape_threshold_pct and p90_ape_threshold_pct (defaults 20 and 40), consumes '
    'daily_close_forecast_backtest_v01, and returns the earliest day whose median/p90 APE '
    'meet both thresholds and remain within them through all later evaluable calendar days.'
)
if f'{ACTION} requires' not in desc:
    action_input['description'] = desc + note

props = action_input['properties']
props.setdefault('median_ape_threshold_pct', {
    'type': 'number', 'minimum': 0, 'maximum': 1000, 'default': 20,
    'description': 'Median absolute percentage error ceiling for predictability_day_v01.'
})
props.setdefault('p90_ape_threshold_pct', {
    'type': 'number', 'minimum': 0, 'maximum': 1000, 'default': 40,
    'description': 'P90 absolute percentage error ceiling for predictability_day_v01.'
})
schema_path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + '\n')

motors_path = Path('rom/motors.md')
text = motors_path.read_text()
heading = f'### `{ACTION}`'
marker = '### `ventas_product_sales_v01`'
section = '''### `predictability_day_v01`

Motor determinista de **selección de día predecible** para Familia 1 — EXPECTATIVA Y CIERRE. Versión interna: `0.1`.

Pregunta:

> ¿Desde qué día calendario el error histórico del forecast entra en la tolerancia definida y permanece dentro de ella hasta el cierre?

Inputs:

```text
start_month: YYYY-MM
end_month: YYYY-MM
median_ape_threshold_pct: number  default 20
p90_ape_threshold_pct: number     default 40
```

Dependencia única de cálculo:

```text
daily_close_forecast_backtest_v01
```

Regla V0.1:

```text
PASS(day)
= median_ape_pct <= median_ape_threshold_pct
AND p90_ape_pct <= p90_ape_threshold_pct
AND targets_evaluable > 0

PREDICTABILITY_DAY
= primer día PASS que también mantiene PASS
  en todos los días calendario evaluables posteriores
```

Grains:

```text
CIDEF_PROPIO
TIENDA_PROPIA_POOLED
```

Los defaults `20% / 40%` son tolerancias operacionales V0.1, no parámetros descubiertos por el backtest. El caller puede reemplazarlos explícitamente sin cambiar el motor.

El output devuelve por grain:

```text
predictability_day
first_day_meeting_thresholds
median_ape_pct_at_day
p90_ape_pct_at_day
targets_evaluable_at_day
maintained_through_last_evaluable_day
last_evaluable_day
```

No hardcodea los días resultantes, no optimiza el forecast y no calcula todavía el forecast live del mes actual.
'''
if heading not in text:
    if marker not in text:
        raise SystemExit('motors insertion marker not found')
    motors_path.write_text(text.replace(marker, section + '\n\n' + marker, 1))
