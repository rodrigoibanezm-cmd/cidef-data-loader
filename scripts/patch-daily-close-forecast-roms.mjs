import fs from 'node:fs';

const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';
const action = 'daily_close_forecast_v01';

function bumpMinor(version) {
  const [major, minor] = String(version).split('.').map(Number);
  return `${major}.${minor + 1}.0`;
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const actions = schema.components.schemas.CustomGptRequest.properties.action.enum;
if (!actions.includes(action)) {
  const at = actions.indexOf('daily_close_forecast_backtest_v01');
  actions.splice(at + 1, 0, action);
  schema.info.version = bumpMinor(schema.info.version);
}
if (!schema.info.description.includes('productive current-month close forecast')) {
  schema.info.description = schema.info.description.replace(
    'No free SQL, no DDL/DML, and no use of the legacy multi-tenant /api/router surface.',
    'Includes a productive current-month close forecast using prior closed-month completion evidence. No free SQL, no DDL/DML, and no use of the legacy multi-tenant /api/router surface.',
  );
}
const input = schema.components.schemas.ActionInput;
if (!input.description.includes('daily_close_forecast_v01 requires cutoff_date')) {
  input.description += ' daily_close_forecast_v01 requires cutoff_date inside the current open America/Santiago month and forecasts CIDEF plus currently observed positive CIDEF stores using same-day median completion from prior closed months; historical accuracy is walk-forward and current actual_close is never used.';
}
input.properties.cutoff_date.description = 'Inclusive calendar cutoff for cutoff-safe daily sales contexts and daily_close_forecast_v01. The productive forecast requires the cutoff to belong to the current open America/Santiago month and not be in the future.';
fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
if (!motors.includes('### `daily_close_forecast_v01`')) {
  const marker = '### `predictability_day_v01`';
  const at = motors.indexOf(marker);
  if (at < 0) throw new Error('predictability day marker not found');
  const section = `### \`daily_close_forecast_v01\`\n\nMotor productivo determinista v0.1 para **Familia 1 — EXPECTATIVA Y CIERRE**.\n\nPregunta:\n\n> Dado lo vendido hasta hoy, ¿cuál es el cierre esperado de CIDEF y de las tiendas propias actualmente observadas, usando sólo historia cerrada anterior?\n\nInput:\n\n\`\`\`text\ncutoff_date: YYYY-MM-DD\n\`\`\`\n\nEl cutoff debe pertenecer al mes calendario abierto vigente en \`America/Santiago\` y no puede estar en el futuro.\n\nDependencias reutilizadas:\n\n\`\`\`text\nventas_context_v01 / LAST-by-VIN cutoff-safe\nventas_daily_organizational_context_v01\ndaily_close_backtest_context_v01\ndaily_close_forecast_backtest_v01 helpers\n\`\`\`\n\nRegla V0.1:\n\n\`\`\`text\ncompletion_ratio = observed_to_date / actual_close\nlearned_completion(day) = median(completion_ratio histórico del mismo día)\nforecast_close = observed_to_date / learned_completion(day)\n\`\`\`\n\nTraining usa exclusivamente meses cerrados anteriores al mes objetivo. Completion histórico igual a cero participa en la mediana; si la mediana es \`<= 0\`, el forecast queda no evaluable y no usa epsilon ni imputación.\n\nGrains productivos:\n\n\`\`\`text\nCIDEF_PROPIO\nTIENDA_PROPIA\n\`\`\`\n\nPara tiendas, la baseline aprendida es \`TIENDA_PROPIA_POOLED\`, igual al backtest V0.1. El output actual incluye sólo tiendas \`tipo_canal='CIDEF'\` con venta positiva observable al cutoff. Una tienda ausente NO se fabrica como cero y no recibe forecast.\n\nOutput principal:\n\n\`\`\`text\nforecast.company:\n  observed_to_date\n  learned_completion\n  training_observations\n  forecast_close\n  evaluable\n\nforecast.stores[]:\n  sucursal_id\n  sucursal\n  observed_to_date\n  learned_completion\n  training_observations\n  forecast_close\n  evaluable\n\nhistorical_accuracy:\n  company\n  stores_pooled\n\`\`\`\n\n\`historical_accuracy\` reutiliza el mismo walk-forward del backtest y expone para el día solicitado MAPE, mediana APE, p75, p90, bias y cobertura cuando existen observaciones evaluables. Es evidencia de error histórico, no un confidence score.\n\nValidaciones principales:\n\n\`\`\`text\ncurrent_context_ok\ntraining_context_ok\ncutoff_is_current_open_month\ntraining_precedes_target\ncompany_formula_reconciles\nstore_formula_reconciles\nstore_scope_cidef_only\nstores_positive_observed_only\ntarget_actual_close_not_used\nno_future_evidence_used\n\`\`\`\n\nNo calcula meta, brecha contra meta, vendedor, escenarios, score ni recomendación. \`predictability_day_v01\` es una capacidad separada que puede interpretar cuándo la precisión histórica cumple tolerancias, pero no altera la fórmula de forecast. Persistencia exclusivamente runtime.\n\n`;
  motors = `${motors.slice(0, at)}${section}${motors.slice(at)}`;
  fs.writeFileSync(motorsPath, motors);
}
