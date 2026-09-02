import fs from 'node:fs';

const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';
const action = 'competitive_signal_backtest_v01';

function bumpMinor(version) {
  const [major, minor] = String(version).split('.').map(Number);
  return `${major}.${minor + 1}.0`;
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
if (!schema.components.schemas.CustomGptRequest.properties.action.enum.includes(action)) {
  const actions = schema.components.schemas.CustomGptRequest.properties.action.enum;
  const at = actions.indexOf('competitive_share_trajectory_v01');
  actions.splice(at + 1, 0, action);
  schema.info.version = bumpMinor(schema.info.version);
}
if (!schema.info.description.includes('competitive signal backtesting')) {
  schema.info.description = schema.info.description.replace(
    'bounded competitive share trajectory with compact trajectory and explicit monthly detail outputs over the same peer semantics',
    'bounded competitive share trajectory with compact trajectory and explicit monthly detail outputs over the same peer semantics, competitive signal backtesting across target×peer×universe without competitor labels',
  );
}
const input = schema.components.schemas.ActionInput;
input.properties.origin_group.description = 'Optional peer filter for competitive_context_v01, competitive_share_trajectory_v01 and competitive_signal_backtest_v01. Derived from the versioned Chile market-brand-origin lookup; missing origin never falls through to NON_CHINESE.';
const outputMode = input.properties.output_mode;
if (!outputMode.enum.includes('pair_detail')) outputMode.enum.push('pair_detail');
outputMode.description = 'Action-specific output mode. competitive_share_trajectory_v01 uses trajectory by default and monthly requires entity_keys; competitive_signal_backtest_v01 uses summary by default and pair_detail requires pair_keys. Other motors retain their documented defaults.';
input.properties.pair_keys = {
  type: 'array', minItems: 1, maxItems: 50, uniqueItems: true,
  items: { type: 'string', minLength: 1 },
  description: 'Explicit target×peer×universe pair keys for competitive_signal_backtest_v01 when output_mode=pair_detail. Transport bound only; it does not define competitor relevance.',
};
fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
if (!motors.includes(`### \`${action}\``)) {
  const marker = '### `product_generation_context_v01`';
  const at = motors.indexOf(marker);
  if (at < 0) throw new Error('product generation marker not found');
  const section = `### \`${action}\`\n\nMotor determinista v0.1 de backtest de señales para **Familia 2 — POSICIÓN COMPETITIVA**.\n\nPregunta:\n\n> ¿Qué evidencia temporal homogénea presenta cada target × peer × universe sobre proximidad, continuidad, alternancia y dirección?\n\nInputs:\n\n\`\`\`text\ntarget_model_ids: bigint[]\ndate_from: YYYY-MM-DD\ndate_to: YYYY-MM-DD\ngeography?: region | comuna\norigin_group?: CHINESE | NON_CHINESE | UNKNOWN\noutput_mode?: summary | pair_detail   default summary\npair_keys?: string[]                  required only for pair_detail; max 50\n\`\`\`\n\nGrain:\n\n\`\`\`text\ntarget_model_id × peer_entity_key × peer_universe × requested period\n\`\`\`\n\nPolítica:\n\n- reutiliza la matriz mensual certificada de \`competitive_share_trajectory_v01\`; no relee RVM por peer ni redefine identidad, denominador, share, rank u origin_group;\n- genera todos los pares elegibles dentro de cada peer universe y excluye únicamente el self-pair exacto;\n- late entrants, disappearances, zero-fill, UNKNOWN origin y peers RAW unresolved se conservan como evidencia;\n- \`active\` significa \`observed=true\`; una fila synthetic zero-fill es inactiva;\n- share gap = diferencia absoluta de share en puntos porcentuales; también conserva signed gap internamente;\n- crossings sólo ocurren dentro de secuencias joint-active y nunca atraviesan gaps inactivos; ties pueden mediar un crossing sin crear crossings extra;\n- convergence/divergence runs usan meses calendario adyacentes joint-active; FLAT o inactividad cortan el run;\n- \`summary\` transporta una fila compacta por par; \`pair_detail\` exige pair_keys y abre sólo esos pares;\n- no define competitor label, score, pesos, thresholds, proximidad productiva ni persistencia productiva.\n\nFeatures V0.1 por par:\n\n\`\`\`text\nshareGap: months, meanPp, medianPp, stddevPopulationPp, minPp, maxPp\ncontinuity: monthsObserved, targetActiveMonths, peerActiveMonths, jointActiveMonths, targetZeroMonths, peerZeroMonths, firstJointActiveMonth, lastJointActiveMonth\ncrossings: count, firstCrossingMonth, lastCrossingMonth\nconvergenceDivergence: run counts + longest run transitions\ndiagnostics.rankGap: evaluableMonths, mean, median, min, max\n\`\`\`\n\n\`pair_detail\` agrega \`monthly[]\`, \`crossingEvents[]\`, \`convergenceDivergenceRuns[]\` y \`activeSpans\`. Co-movement y proximity episodes quedan fuera de V0.1. Persistencia exclusivamente runtime.\n\nValidaciones incluyen targets/universos, reconciliación mensual, pair count, self-pairs, keys únicas, consistencia de universe/meses, share gaps, continuity y detail pair-key completeness. Warnings del contexto competitivo se propagan.\n\n`;
  motors = `${motors.slice(0, at)}${section}${motors.slice(at)}`;
  fs.writeFileSync(motorsPath, motors);
}
