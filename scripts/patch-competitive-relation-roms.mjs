import fs from 'node:fs';

const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';
const action = 'competitive_relation_v01';

function bumpMinor(version) {
  const [major, minor] = String(version).split('.').map(Number);
  return `${major}.${minor + 1}.0`;
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const actions = schema.components.schemas.CustomGptRequest.properties.action.enum;
if (!actions.includes(action)) {
  const at = actions.indexOf('competitive_signal_backtest_v01');
  actions.splice(at + 1, 0, action);
  schema.info.version = bumpMinor(schema.info.version);
}
if (!schema.info.description.includes('productive competitive relation')) {
  schema.info.description = schema.info.description.replace(
    'paginated competitive signal backtesting across target×peer×universe without competitor labels',
    'paginated competitive signal backtesting across target×peer×universe without competitor labels, productive competitive relation selection under a fixed V0.1 temporal rule',
  );
}
const input = schema.components.schemas.ActionInput;
if (!input.description.includes('competitive_relation_v01')) {
  input.description += ' competitive_relation_v01 requires target_model_ids, date_from, date_to and explicit CHINESE or NON_CHINESE origin_group; it applies the fixed V0.1 relation rule and accepts pair_offset/pair_limit only as transport pagination over selected relations.';
}
input.properties.origin_group.description = 'Optional peer filter for competitive_context_v01, competitive_share_trajectory_v01 and competitive_signal_backtest_v01. competitive_relation_v01 requires an explicit known group: CHINESE or NON_CHINESE. Derived from the versioned Chile market-brand-origin lookup; missing origin never falls through to NON_CHINESE.';
input.properties.pair_offset.description = 'Zero-based transport offset for competitive_signal_backtest_v01 summary or competitive_relation_v01 selected relations. Pagination only; all eligible pairs are still calculated.';
input.properties.pair_limit.description = 'Maximum pair summaries or selected competitive relations transported, depending on action. Range 1..50; pagination only and never a relevance threshold.';
fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
if (!motors.includes('### `competitive_relation_v01`')) {
  const marker = '### `product_generation_context_v01`';
  const at = motors.indexOf(marker);
  if (at < 0) throw new Error('product generation marker not found');
  const section = `### \`competitive_relation_v01\`\n\nMotor productivo determinista v0.1 para **Familia 2 — POSICIÓN COMPETITIVA**.\n\nPregunta:\n\n> ¿Qué modelos presentan una relación competitiva temporal plausible con uno o más productos CIDEF dentro del mismo peer universe estructural y grupo de origen?\n\nInputs:\n\n\`\`\`text\ntarget_model_ids: bigint[]\ndate_from: YYYY-MM-DD\ndate_to: YYYY-MM-DD\norigin_group: CHINESE | NON_CHINESE   required\ngeography?: region | comuna\npair_offset?: integer >= 0            default 0\npair_limit?: integer 1..50            default 20\n\`\`\`\n\nDependencia:\n\n\`\`\`text\ncompetitive_signal_backtest_v01 v0.2\n\`\`\`\n\nNo relee RVM por peer ni redefine identidad, universo, origin_group, zero-fill, share gap, continuidad o crossings. Calcula todos los pares elegibles mediante el stack competitivo existente y aplica una única regla productiva versionada.\n\nRegla V0.1:\n\n\`\`\`text\nCOMPETITIVE_RELATION_V01 =\n    shareGap.medianPp <= 3.0\nAND continuity.jointActiveMonths >= 6\nAND crossings.count >= 1\n\`\`\`\n\nLos tres límites son inclusivos. No existe score, peso, probabilidad, Pareto, top-N ni fallback. \`origin_group=UNKNOWN\` no es aceptado por este motor productivo.\n\nGrain interno:\n\n\`\`\`text\ntarget_model_id × peer_entity_key × peer_universe × requested period\n\`\`\`\n\nLa salida transporta sólo relaciones seleccionadas y conserva evidencia mínima auditable:\n\n\`\`\`text\npairKey\ntargetModelId\npeer.entityKey\npeer.modelId\npeer.identityStatus\npeer.brand\npeer.model\nuniverseKey\nevidence.medianShareGapPp\nevidence.jointActiveMonths\nevidence.crossings\nrelation = COMPETITIVE_RELATION\nruleVersion = 0.1\n\`\`\`\n\n\`pair_offset/pair_limit\` paginan después de aplicar la regla y son exclusivamente transporte. \`coverage.totalPairs\` mantiene todos los pares calculados; además devuelve selectedPairs, rejectedPairs y selectedRate.\n\nValidaciones principales:\n\n\`\`\`text\nsource_signal_backtest_ok\nsource_monthly_share_reconciles\nrelation_count_reconciles\nselected_pair_keys_unique\nselected_pairs_satisfy_rule\nno_self_relations\n\`\`\`\n\nWarnings del stack competitivo se propagan. Persistencia exclusivamente runtime; no crea tabla de competidores. Esta V0.1 no afirma sustitución causal ni que un modelo robe ventas a otro: certifica únicamente una relación competitiva temporal bajo la regla cerrada.\n\n`;
  motors = `${motors.slice(0, at)}${section}${motors.slice(at)}`;
  fs.writeFileSync(motorsPath, motors);
}
