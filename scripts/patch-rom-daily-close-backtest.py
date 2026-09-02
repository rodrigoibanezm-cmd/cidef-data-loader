import json
from pathlib import Path

ACTION = 'daily_close_backtest_context_v01'

schema_path = Path('rom/schema.json')
schema = json.loads(schema_path.read_text())
schema['info']['version'] = '1.25.0'
actions = schema['components']['schemas']['CustomGptRequest']['properties']['action']['enum']
if ACTION not in actions:
    actions.insert(actions.index('ventas_daily_organizational_context_v01') + 1, ACTION)
desc = schema['components']['schemas']['ActionInput']['description']
note = (
    ' daily_close_backtest_context_v01 requires start_month and end_month, rejects open months, '
    'and returns cutoff-safe company/store observations with actual_close as LABEL_ONLY. '
    'Store-months are emitted only when month-end CIDEF actual_close > 0; an absent daily row '
    'inside that cohort is CERTIFIED_ZERO. It does not forecast or calculate predictability.'
)
if f'{ACTION} requires' not in desc:
    schema['components']['schemas']['ActionInput']['description'] = desc + note
schema_path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + '\n')

motors_path = Path('rom/motors.md')
text = motors_path.read_text()
heading = f'### `{ACTION}`'
marker = '### `ventas_product_sales_v01`'
section = '''### `daily_close_backtest_context_v01`

Motor runtime determinista de **contexto observacional diario** para Familia 1 — EXPECTATIVA Y CIERRE. Versión interna: `0.1`.

Inputs obligatorios:

```text
start_month: YYYY-MM
end_month: YYYY-MM
```

`end_month` debe ser cerrado; rango máximo 84 meses. Fuentes: `ventas_raw` y `sucursales_master`.

Pipeline:

```text
carga ventas_raw una vez
→ parseFechaFactura certificado
→ timeline incremental cutoff-safe
→ VIN no nulo: LAST observable al final de cada día
→ empate exacto: menor stable id
→ VIN nulo: una unidad por fila parseable
→ identidad histórica exacta
→ tipo_canal
→ snapshots diarios
```

No invoca el motor público una vez por día. Reutiliza `ventasContextUtils`, `loadOrganizationalIdentityMaps` y `enrichRecognizedSale` para evitar miles de ejecuciones redundantes.

Grains:

```text
CIDEF_PROPIO  = target_month + cutoff_date
TIENDA_PROPIA = target_month + cutoff_date + sucursal_id
```

Universo tienda V0.1:

```text
month-end tipo_canal='CIDEF' AND actual_close > 0
```

Semántica:

```text
fila positiva al cutoff → POSITIVE_OBSERVED
sin fila al cutoff + actual_close > 0 → CERTIFIED_ZERO
sin label positivo al cierre → store-month no emitido / UNKNOWN
actual_close → LABEL_ONLY
```

Devuelve `company_observations[]` y `store_observations[]` con `target_month`, `cutoff_date`, `day_of_month`, `observed_to_date` y `actual_close`; tienda agrega `sucursal_id`, `sucursal` y `observation_semantics`.

Validaciones: grains únicos, cutoff dentro del mes, no negativos, `observed_to_date <= actual_close`, igualdad al cierre, identidad/canal completos al month-end, ausencia de estado negativo y reconciliación CIDEF propio contra tiendas elegibles.

Si `observed_to_date > actual_close`, no clampa ni corrige: falla la validation y devuelve `status=warning`.

No calcula `completion_ratio`, forecast, forecast error, thresholds ni `PREDICTABILITY_DAY`.
'''
if heading not in text:
    if marker not in text:
        raise SystemExit('motors insertion marker not found')
    motors_path.write_text(text.replace(marker, section + '\n\n' + marker, 1))
