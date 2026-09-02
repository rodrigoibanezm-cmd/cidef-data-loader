import fs from 'node:fs';

const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';
const action = 'competitive_share_trajectory_v01';

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
schema.info.version = '1.22.0';
schema.info.description = schema.info.description.replace(
  'monthly competitive share trajectory over the same peer semantics',
  'bounded competitive share trajectory with compact trajectory and explicit monthly detail outputs over the same peer semantics',
);
const input = schema.components.schemas.ActionInput;
if (!input.description.includes('output_mode=trajectory')) {
  input.description = input.description.replace(
    'competitive_context_v01 and competitive_share_trajectory_v01 require target_model_ids, date_from and date_to; geography and origin_group are optional.',
    'competitive_context_v01 and competitive_share_trajectory_v01 require target_model_ids, date_from and date_to; geography and origin_group are optional. competitive_share_trajectory_v01 defaults to output_mode=trajectory; output_mode=monthly requires entity_keys.',
  );
}
const outputMode = input.properties.output_mode;
if (!outputMode.enum.includes('trajectory')) outputMode.enum.push('trajectory');
delete outputMode.default;
outputMode.description = 'Action-specific output mode. competitive_share_trajectory_v01 uses trajectory by default; monthly requires entity_keys. Other motors retain their documented runtime defaults.';
input.properties.entity_keys = {
  type: 'array', minItems: 1, maxItems: 50, uniqueItems: true,
  items: { type: 'string', minLength: 1 },
  description: 'Explicit market entity keys for competitive_share_trajectory_v01 when output_mode=monthly. Transport bound only; it does not define competitor relevance.',
};
fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
const start = motors.indexOf(`### \`${action}\``);
const end = motors.indexOf('### `product_generation_context_v01`', start);
if (start < 0 || end < 0) throw new Error('competitive trajectory ROM section not found');
const section = `### \`${action}\`\n\nMotor determinista v0.2 de trayectoria mensual para **Familia 2 — POSICIÓN COMPETITIVA**.\n\nPregunta:\n\n> ¿Cómo cambia mes a mes el share y ranking de los modelos dentro del mismo peer universe observable de un target CIDEF?\n\nInputs:\n\n\`\`\`text\ntarget_model_ids: bigint[]\ndate_from: YYYY-MM-DD\ndate_to: YYYY-MM-DD\ngeography?: region | comuna\norigin_group?: CHINESE | NON_CHINESE | UNKNOWN\noutput_mode?: trajectory | monthly   default trajectory\nentity_keys?: string[]               required only for monthly; max 50\n\`\`\`\n\nPolítica:\n\n- reutiliza identidad RVM→MASTER y peer semantics de \`competitive_context_v01\`;\n- fija universos sobre todo el período y calcula internamente la matriz mensual completa;\n- \`trajectory\` es la salida compacta por defecto y NO transporta \`monthly[]\`;\n- \`monthly\` exige \`entity_keys\` y transporta solo esas entidades;\n- \`entity_keys\` limita transporte, no define relevancia ni competidores;\n- con \`origin_group\`, el denominador mensual se recalcula dentro del grupo;\n- entidades observadas en el período se zero-fill en meses sin inscripción: units=0, share=0, rank=null;\n- no define competidores ni thresholds.\n\nOutputs:\n\n\`\`\`text\ntrajectory (default):\n  peerUniverses[]\n  trajectory[]\n\nmonthly:\n  peerUniverses[]\n  monthly[] only for requested entity_keys\n\nboth:\n  scope + targets + validation + warnings\n\`\`\`\n\nValidaciones adicionales de monthly:\n\n\`\`\`text\nrequested_entity_keys\nmatched_entity_keys\nmonthly_rows_returned\nentity_keys_complete\n\`\`\`\n\n`;
motors = `${motors.slice(0, start)}${section}${motors.slice(end)}`;
fs.writeFileSync(motorsPath, motors);
