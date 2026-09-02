import fs from 'node:fs';

const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';
const action = 'competitive_share_trajectory_v01';

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
schema.info.version = '1.21.0';
if (!schema.info.description.includes('monthly competitive share trajectory')) {
  schema.info.description = schema.info.description.replace(
    'shared competitive context with optional Chile market-origin peer filtering,',
    'shared competitive context with optional Chile market-origin peer filtering, monthly competitive share trajectory over the same peer semantics,',
  );
}
const actions = schema.components.schemas.CustomGptRequest.properties.action.enum;
if (!actions.includes(action)) {
  const index = actions.indexOf('competitive_context_v01');
  actions.splice(index + 1, 0, action);
}
const input = schema.components.schemas.ActionInput;
if (!input.description.includes(action)) {
  input.description = input.description.replace(
    'competitive_context_v01 requires target_model_ids, date_from and date_to; geography and origin_group are optional.',
    'competitive_context_v01 and competitive_share_trajectory_v01 require target_model_ids, date_from and date_to; geography and origin_group are optional.',
  );
}
input.properties.origin_group.description =
  'Optional peer filter for competitive_context_v01 and competitive_share_trajectory_v01. Derived from the versioned Chile market-brand-origin lookup; missing origin never falls through to NON_CHINESE.';
fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
if (!motors.includes(`### \`${action}\``)) {
  const marker = '### `product_generation_context_v01`';
  const section = `### \`${action}\`\n\nMotor determinista de trayectoria mensual para **Familia 2 — POSICIÓN COMPETITIVA**.\n\nPregunta:\n\n> ¿Cómo cambia mes a mes el share y ranking de los modelos dentro del mismo peer universe observable de un target CIDEF?\n\nInputs:\n\n\`\`\`text\ntarget_model_ids: bigint[]\ndate_from: YYYY-MM-DD\ndate_to: YYYY-MM-DD\ngeography?: region | comuna\norigin_group?: CHINESE | NON_CHINESE | UNKNOWN\n\`\`\`\n\nDependencia compartida:\n\n\`\`\`text\ncompetitive_context_v01\n\`\`\`\n\nPolítica:\n\n- reutiliza exactamente identidad RVM→MASTER y semántica de peer group de \`competitive_context_v01\`;\n- fija los universos desde todo el período solicitado y luego agrupa RVM por mes dentro de esos universos;\n- no ejecuta una consulta independiente por mes;\n- con \`origin_group\`, deriva el origen desde el lookup Chile versionado y recalcula el denominador mensual dentro del grupo;\n- una entidad observada al menos una vez en el período recibe \`units=0\` y \`share=0\` en meses sin inscripción; esos ceros sintéticos exponen \`rank=null\`;\n- no define competidores ni thresholds: expone evidencia de trayectoria.\n\nDevuelve:\n\n\`\`\`text\nsharedContext:\n  scope\n  targets[]\n  peerUniverses[]\n  monthly[]:\n    month + universe + entity + units + share + rank + cumulativeShare\n  trajectory[]:\n    first/last share + shareChangePp + first/last rank + rankChange + totalUnits\n  validation\n  warnings[]\n\`\`\`\n\nValidaciones principales:\n\n\`\`\`text\nbase_context_ok\nmonthly_share_reconciles\nmonths_returned\nuniverses_returned\nraw_monthly_rows\ndense_monthly_rows\n\`\`\`\n\n`;
  if (!motors.includes(marker)) throw new Error('product_generation_context_v01 marker not found');
  motors = motors.replace(marker, `${section}${marker}`);
  fs.writeFileSync(motorsPath, motors);
}
