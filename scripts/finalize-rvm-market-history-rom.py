import json
from pathlib import Path

schema_path = Path('rom/schema.json')
schema = json.loads(schema_path.read_text())
schema['info']['version'] = '1.44.0'
action_enum = schema['components']['schemas']['CustomGptRequest']['properties']['action']['enum']
if 'rvm_market_history_v01' not in action_enum:
    anchor = action_enum.index('competitive_inverse_share_movement_v01') + 1
    action_enum.insert(anchor, 'rvm_market_history_v01')

schemas = schema['components']['schemas']
schemas['RvmPeriod'] = {
    'type': 'object',
    'required': ['kind'],
    'properties': {
        'kind': {'type': 'string', 'enum': ['MONTH', 'YEAR', 'YTD', 'CUSTOM_RANGE']},
        'month': {'type': 'string', 'pattern': '^\\d{4}-(0[1-9]|1[0-2])$'},
        'year': {'type': 'integer', 'minimum': 1900, 'maximum': 2200},
        'through_date': {'type': 'string', 'format': 'date'},
        'date_from': {'type': 'string', 'format': 'date'},
        'date_to': {'type': 'string', 'format': 'date'},
    },
    'additionalProperties': False,
}
schemas['RvmGeography'] = {
    'type': 'object',
    'required': ['level', 'values'],
    'properties': {
        'level': {'type': 'string', 'enum': ['REGION', 'COMUNA']},
        'values': {'type': 'array', 'minItems': 1, 'maxItems': 100, 'uniqueItems': True, 'items': {'type': 'string'}},
    },
    'additionalProperties': False,
}
schemas['RvmUniverseDefinition'] = {
    'type': 'object',
    'properties': {
        'segment': {'type': 'string'},
        'type': {'type': 'string'},
        'fuel': {'type': 'string'},
        'geography': {'$ref': '#/components/schemas/RvmGeography'},
    },
    'additionalProperties': False,
}

action_input = schemas['ActionInput']
action_input['x-rvm-market-history-v01'] = {
    'version': '0.1',
    'availability': 'AVAILABLE',
    'business_question': 'How did an explicitly defined RVM universe evolve through time, optionally broken down by one requested dimension?',
    'units': 'SUM(rvm_raw.cantidad); never COUNT(*)',
    'period_semantics': 'period OR period_a+period_b; MONTH/YEAR/YTD/CUSTOM_RANGE inclusive; open years are not accepted as full YEAR',
    'universe_semantics': 'caller-explicit segment/type/fuel/geography filters using competitive_context_v01 normalization semantics; empty object means total RVM market',
    'breakdown': 'optional one of SEGMENT, TYPE, FUEL, BRAND, MODEL, REGION, COMUNA; VERSION excluded',
    'identity': 'BRAND/MODEL reuse the contextual/generic RVM->MASTER primitive from the competitive stack; ambiguous and unresolved units remain in the denominator',
    'coverage': 'identity coverage is COMPLETE only with zero ambiguous and unresolved units; otherwise PARTIAL; no percentage threshold',
    'reconciliation': 'all exhaustive breakdown buckets must sum to universe_units; resolved+ambiguous+unresolved must reconcile for identity breakdowns',
    'comparison': 'delta_units=B-A; delta_pct=(B-A)/A; ZERO_BASE when A=0; comparability metadata is explicit and non-blocking',
    'states': ['INVALID_PERIOD','INVALID_UNIVERSE_DIMENSION','NO_RVM_EVIDENCE','ZERO_BASE','IDENTITY_PARTIAL','IDENTITY_AMBIGUOUS_PRESENT','IDENTITY_UNRESOLVED_PRESENT','RECONCILIATION_FAILED','RESPONSE_TOO_LARGE'],
    'exclusions': ['target CIDEF','target share/rank','product contribution','VERSION identity','materiality','Pareto','causal attribution','narrative'],
}
props = action_input['properties']
props['period'] = {'$ref': '#/components/schemas/RvmPeriod'}
for key in ['period_a', 'period_b']:
    old = props[key]
    if 'oneOf' not in old:
        props[key] = {
            'oneOf': [old, {'$ref': '#/components/schemas/RvmPeriod'}],
            'description': 'Closed YYYY-MM for existing sales contribution motors OR an RVM period object for rvm_market_history_v01.',
        }
props['time_grain'] = {'type': 'string', 'enum': ['MONTH', 'YEAR'], 'default': 'MONTH', 'description': 'rvm_market_history_v01 output time grain.'}
props['universe_definition'] = {'$ref': '#/components/schemas/RvmUniverseDefinition'}
props['breakdown'] = {'type': 'string', 'enum': ['SEGMENT','TYPE','FUEL','BRAND','MODEL','REGION','COMUNA'], 'description': 'Optional single exhaustive breakdown for rvm_market_history_v01.'}
marker = 'rvm_market_history_v01 accepts period OR period_a+period_b'
if marker not in action_input.get('description', ''):
    action_input['description'] = action_input.get('description', '') + ' ' + marker + ', time_grain MONTH|YEAR, explicit universe_definition, and one optional breakdown.'
schema_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + '\n')

motors_path = Path('rom/motors.md')
motors = motors_path.read_text()
if '### `rvm_market_history_v01`' not in motors:
    section = """### `rvm_market_history_v01`

Motor determinista productivo v0.1 de historia de mercado RVM.

Pregunta:

> ¿Cómo evolucionó un universo RVM explícitamente definido a través del tiempo y, opcionalmente, cómo se compone por una dimensión solicitada?

Inputs:

```text
period OR period_a + period_b
period.kind: MONTH | YEAR | YTD | CUSTOM_RANGE
time_grain: MONTH | YEAR
universe_definition?: segment?, type?, fuel?, geography?: { level: REGION | COMUNA, values[] }
breakdown?: SEGMENT | TYPE | FUEL | BRAND | MODEL | REGION | COMUNA
```

Semántica:

- unidad analítica = `SUM(rvm_raw.cantidad)`; nunca `COUNT(*)`;
- períodos inclusivos; YEAR sólo años completos, YTD exige `through_date`, CUSTOM_RANGE exige ambos límites;
- A/B devuelve comparabilidad explícita y no bloqueante: `SAME_YTD_BOUNDARY`, `DIFFERENT_YTD_BOUNDARY`, `SAME_CALENDAR_WINDOW`, `SAME_DURATION`, `DIFFERENT_DURATION`;
- el universo siempre lo entrega el caller; `{}` significa mercado total;
- `segment`, `type`, `fuel` y geografía reutilizan normalización exacta del stack competitivo;
- breakdown se aplica después del universo y no redefine el denominador;
- BRAND/MODEL reutilizan la primitive compartida de aliases RVM contextuales/genéricos y estados `RESUELTO / AMBIGUO / NO_RESUELTO`;
- ambiguos/no resueltos nunca desaparecen del denominador.

Output: `scope`, `periods[]`, `series[]`, `comparison?`, `breakdown?`, `coverage`, `validation`, `warnings`.

Coverage BRAND/MODEL incluye `total_rows`, `total_units`, `resolved_units`, `ambiguous_units`, `unresolved_units`, sus proporciones, `corrections_negative_units` y `non_standard_quantity_rows`. `COMPLETE` exige cero ambiguous y cero unresolved; de lo contrario `PARTIAL`, sin threshold porcentual.

Reconciliación:

```text
SUM(all exhaustive breakdown buckets) = universe_units
RESOLVED + AMBIGUOUS + UNRESOLVED = universe_units  # BRAND/MODEL
```

Si A=0, `delta_pct=null` y `reason=ZERO_BASE`. Estados/warnings: `INVALID_PERIOD`, `INVALID_UNIVERSE_DIMENSION`, `NO_RVM_EVIDENCE`, `ZERO_BASE`, `IDENTITY_PARTIAL`, `IDENTITY_AMBIGUOUS_PRESENT`, `IDENTITY_UNRESOLVED_PRESENT`, `RECONCILIATION_FAILED`, `RESPONSE_TOO_LARGE`.

Exclusiones V0.1: target CIDEF, share/rank target, contribución de producto, VERSION identity, materialidad, Pareto, causalidad y narrativa.

Availability:

```text
AVAILABLE
version = 0.1
endpoint = /api/custom-gpt
```

"""
    if '## NOT AVAILABLE' not in motors:
        raise SystemExit('motors.md missing NOT AVAILABLE anchor')
    motors_path.write_text(motors.replace('## NOT AVAILABLE', section + '## NOT AVAILABLE'))
