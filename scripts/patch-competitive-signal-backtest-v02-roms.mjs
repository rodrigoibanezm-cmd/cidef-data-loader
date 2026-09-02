import fs from 'node:fs';

const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

schema.info.version = '1.26.0';
if (!schema.info.description.includes('paginated competitive signal backtesting')) {
  schema.info.description = schema.info.description.replace(
    'competitive signal backtesting across target×peer×universe without competitor labels',
    'paginated competitive signal backtesting across target×peer×universe without competitor labels',
  );
}

const input = schema.components.schemas.ActionInput;
input.properties.output_mode.description = 'Action-specific output mode. competitive_share_trajectory_v01 uses trajectory by default and monthly requires entity_keys; competitive_signal_backtest_v01 uses paginated summary by default and pair_detail requires pair_keys. Other motors retain their documented defaults.';
input.properties.pair_offset = {
  type: 'integer', minimum: 0, default: 0,
  description: 'Zero-based transport offset for competitive_signal_backtest_v01 when output_mode=summary. Pagination only; all eligible pairs are still calculated.'
};
input.properties.pair_limit = {
  type: 'integer', minimum: 1, maximum: 50, default: 20,
  description: 'Maximum pair summaries transported by competitive_signal_backtest_v01 when output_mode=summary. Pagination only; it does not define relevance or competitors.'
};
fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
const start = motors.indexOf('### `competitive_signal_backtest_v01`');
const end = motors.indexOf('### `product_generation_context_v01`', start);
if (start < 0 || end < 0) throw new Error('competitive signal motor section not found');
let section = motors.slice(start, end);
section = section.replace('Motor determinista v0.1 de backtest de señales', 'Motor determinista v0.2 de backtest de señales');
section = section.replace(
  'output_mode?: summary | pair_detail   default summary\npair_keys?: string[]                  required only for pair_detail; max 50',
  'output_mode?: summary | pair_detail   default summary\npair_offset?: integer >= 0             summary only; default 0\npair_limit?: integer 1..50             summary only; default 20\npair_keys?: string[]                   required only for pair_detail; max 50',
);
section = section.replace(
  '- `summary` transporta una fila compacta por par; `pair_detail` exige pair_keys y abre sólo esos pares;',
  '- `summary` calcula todos los pares pero transporta una página determinística ordenada por `pairKey`; `pair_offset`/`pair_limit` son límites de transporte y nunca filtros de relevancia;\n- cada `summary` devuelve `page.totalPairs`, `returnedPairs`, `hasMore` y `nextOffset`; metadata repetida de target/universe se normaliza contra `targets[]` y `universes[]`;\n- `pair_detail` exige pair_keys y abre sólo esos pares;',
);
section = section.replace(
  '`pair_detail` agrega `monthly[]`, `crossingEvents[]`, `convergenceDivergenceRuns[]` y `activeSpans`. Co-movement y proximity episodes quedan fuera de V0.1. Persistencia exclusivamente runtime.',
  '`summary` devuelve features completas sólo para la página transportada, mientras `coverage.pairs` y `page.totalPairs` conservan el total calculado. `pair_detail` agrega `monthly[]`, `crossingEvents[]`, `convergenceDivergenceRuns[]` y `activeSpans`. Co-movement y proximity episodes quedan fuera de V0.2. Persistencia exclusivamente runtime.',
);
motors = `${motors.slice(0, start)}${section}${motors.slice(end)}`;
fs.writeFileSync(motorsPath, motors);
