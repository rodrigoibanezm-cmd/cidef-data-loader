import fs from 'node:fs';

const ACTION = 'intramonth_sales_history_context_v01';
const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';

function bumpMinor(version) {
  const [major = '1', minor = '0'] = String(version || '1.0.0').split('.');
  return `${major}.${Number(minor) + 1}.0`;
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const actions = schema.components.schemas.CustomGptRequest.properties.action.enum;
const existed = actions.includes(ACTION);

if (!existed) {
  const anchor = actions.indexOf('daily_close_backtest_context_v01');
  if (anchor >= 0) actions.splice(anchor + 1, 0, ACTION);
  else actions.push(ACTION);
  schema.info.version = bumpMinor(schema.info.version);
}

const infoPhrase = 'historical intramonth cutoff-safe sales context with sparse-positive store semantics and retrospective close labels';
if (!schema.info.description.includes(infoPhrase)) {
  schema.info.description = schema.info.description.replace(
    'No free SQL,',
    `${infoPhrase}, and no free SQL,`,
  );
}

const inputDescription = schema.components.schemas.ActionInput.description;
const inputPhrase = `${ACTION} requires start_month and end_month, accepts closed history plus the current open month through the current America/Santiago date, emits CIDEF daily rows and sparse-positive store rows, and exposes actual_close only as a retrospective label for closed months. It does not calculate ratios, trajectory benchmarks, forecasts, thresholds or alerts.`;
if (!inputDescription.includes(ACTION)) {
  schema.components.schemas.ActionInput.description = `${inputDescription} ${inputPhrase}`;
}
fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
if (!motors.includes(`### \`${ACTION}\``)) {
  const anchor = '### `ventas_product_sales_v01`';
  const section = `### \`${ACTION}\`\n\nContexto runtime determinista de historia intra-mes para **Familia 1 — EXPECTATIVA Y CIERRE**. Versión interna: \`0.1\`.\n\nPregunta:\n\n> ¿Cómo se distribuye históricamente dentro del mes la construcción de las ventas reconocidas de CIDEF y de sus tiendas propias?\n\nInputs:\n\n\`\`\`text\nstart_month: YYYY-MM\nend_month: YYYY-MM\n\`\`\`\n\nFuentes: \`ventas_raw\` y \`sucursales_master\`.\n\nPipeline:\n\n\`\`\`text\nfiltro temporal observable\n→ timeline cutoff-safe LAST-by-VIN compartido\n→ identidad histórica exacta de sucursal\n→ tipo_canal='CIDEF'\n→ snapshots calendario diarios\n→ cidef_daily + store_daily\n\`\`\`\n\nGrains:\n\n\`\`\`text\nCIDEF  = target_month + cutoff_date\nTIENDA = target_month + cutoff_date + sucursal_id\n\`\`\`\n\nPolítica:\n\n- acepta meses cerrados y el mes calendario actual; rechaza meses futuros;\n- el mes abierto emite sólo \`cutoff_date <= fecha actual\` en \`America/Santiago\`;\n- CIDEF puede emitir \`accumulated_sales=0\`;\n- tienda es \`SPARSE_POSITIVE\`: sólo filas con venta positiva observada; ausencia nunca significa cero;\n- \`actual_close\` es \`LABEL_RETROSPECTIVE\` para meses cerrados y \`null\` para el mes abierto;\n- el label nunca debe interpretarse como evidencia disponible al cutoff;\n- no calcula \`completion_ratio\`, curvas esperadas, forecast, pendiente, rescate, threshold ni alerta;\n- persistencia exclusivamente runtime.\n\nOutput principal:\n\n\`\`\`text\ncidef_daily[]: target_month, cutoff_date, day_of_month, accumulated_sales, actual_close\nstore_daily[]: target_month, cutoff_date, day_of_month, sucursal_id, accumulated_sales, actual_close\ncoverage.daily[]: recognized_sales_in_target_month_to_date, resolved_store, unresolved_store, ambiguous_store, unknown_channel, cidef_owned_sales_to_date\n\`\`\`\n\nValidaciones:\n\n\`\`\`text\ncoverage_reconciles\nstore_rows_sparse_positive\nopen_month_labels_null\nclosed_month_end_equals_label\nno_future_cutoff_dates\nno_post_cutoff_evidence_used\n\`\`\`\n\nDiferencia frente a \`daily_close_backtest_context_v01\`: ese backtest sólo acepta meses cerrados y densifica un cohort month-end con \`CERTIFIED_ZERO\`; este contexto conserva explícitamente \`SPARSE_POSITIVE\` y soporta el mes abierto. Son contratos distintos.\n\n`;
  if (!motors.includes(anchor)) throw new Error('motors.md anchor not found');
  motors = motors.replace(anchor, `${section}${anchor}`);
  fs.writeFileSync(motorsPath, motors);
}
