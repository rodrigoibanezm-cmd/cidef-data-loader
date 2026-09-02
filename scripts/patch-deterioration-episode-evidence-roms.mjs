import fs from 'node:fs';

const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';
const action = 'org_sales_deterioration_episode_evidence_v01';

function bumpPatch(version) {
  const [major, minor, patch] = String(version).split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const actionEnum = schema.components.schemas.CustomGptRequest.properties.action.enum;
if (!actionEnum.includes(action)) {
  const anchor = actionEnum.indexOf('org_sales_deterioration_backtest_v01');
  actionEnum.splice(anchor + 1, 0, action);
  schema.info.version = bumpPatch(schema.info.version);
}
if (!schema.info.description.includes('deterioration episode evidence')) {
  schema.info.description = schema.info.description.replace(
    'bounded organization sales deterioration backtesting with sparse observation semantics',
    'bounded organization sales deterioration backtesting with sparse observation semantics, deterioration episode evidence with ex-ante signal rows',
  );
}
const input = schema.components.schemas.ActionInput;
if (!input.description.includes(action)) {
  input.description += ` ${action} requires grain, start_month, end_month and exactly one value in each deterioration candidate array; it returns bounded ex-ante onset/confirmation/persistence evidence plus separate future evaluation and accepts optional context_months and detail_unit_id.`;
}
input.properties.context_months = {
  type: 'integer', minimum: 1, maximum: 12, default: 3,
  description: 'Transport-only number of contiguous evaluable months returned before episode onset by org_sales_deterioration_episode_evidence_v01; never part of signal generation.',
};
input.properties.detail_unit_id.description = 'Optional canonical unit_id filter for observation-semantics audit or deterioration episode evidence; applied before detail_limit.';
fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
const auditAnchor = '### `org_sales_observation_semantics_audit_v01`';
if (!motors.includes(`### \`${action}\``)) {
  const section = `### \`${action}\`\n\nCapacidad determinista de evidencia para **Familia 3 — DETERIORO Y RED FLAGS**. Versión interna actual: \`0.1\`. No define una nueva regla: reutiliza exactamente el runtime y la evaluación de \`org_sales_deterioration_backtest_v01\` v0.4.\n\nPregunta:\n\n> ¿Qué evidencia ex-ante concreta hizo que un episodio de deterioro se activara?\n\nInputs:\n\n\`\`\`text\ngrain: tienda | vendedor\nstart_month: YYYY-MM\nend_month: YYYY-MM\ncandidate_baselines: exactamente 1\ncandidate_deviation_methods: exactamente 1\ncandidate_persistence_rules: exactamente 1\ncontext_months?: 1..12, default 3\ndetail_unit_id?: unit_id\ndetail_limit?: 1..200\n\`\`\`\n\nEl motor comparte \`buildOrgDeteriorationRuntime()\`: ventas reconocidas, identidad, semántica sparse, baseline, deviations y persistencia son las mismas que en v0.4. \`context_months\` sólo limita presentación; nunca cambia la señal.\n\nCada \`episode_evidence[]\` expone:\n\n\`\`\`text\nunit_id / unit_label\nonset_month / confirmation_month / lead_periods\ncandidate\nsignal_evidence.pre_onset_context[]\nsignal_evidence.onset\nsignal_evidence.confirmation\nsignal_evidence.persistence_rows[]\nfuture_evaluation\n\`\`\`\n\nCada fila de señal contiene \`month\`, \`sales\`, \`baseline\`, \`error\`, \`deviation_method\`, \`deviation_value\`, \`error_history_available\` y \`adverse\`. Los meses exactos usados por persistencia provienen de \`evaluatePersistence()\`; no se reconstruyen con una fórmula paralela.\n\n\`future_evaluation\` permanece separado y nunca participa en \`signal_evidence\`. Validaciones explícitas: \`episode_signal_evidence_complete\` y \`signal_context_uses_no_future_rows\`. Output acotado reporta \`matched_rows\`, \`returned_rows\` y \`truncated\`.\n\n`;
  if (!motors.includes(auditAnchor)) throw new Error('observation audit anchor not found');
  motors = motors.replace(auditAnchor, `${section}${auditAnchor}`);
}
fs.writeFileSync(motorsPath, motors);
