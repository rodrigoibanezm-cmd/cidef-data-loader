import fs from 'node:fs';

const schemaPath = 'rom/schema.json';
const motorsPath = 'rom/motors.md';
const action = 'org_sales_deterioration_status_v01';

function bumpMinor(version) {
  const [major, minor] = String(version).split('.').map(Number);
  return `${major}.${minor + 1}.0`;
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const actions = schema.components.schemas.CustomGptRequest.properties.action.enum;
if (!actions.includes(action)) {
  const anchor = actions.indexOf('org_sales_deterioration_episode_evidence_v01');
  actions.splice(anchor + 1, 0, action);
  schema.info.version = bumpMinor(schema.info.version);
}

if (!schema.info.description.includes('productive store deterioration status')) {
  schema.info.description = schema.info.description.replace(
    'deterioration episode evidence with ex-ante signal rows',
    'deterioration episode evidence with ex-ante signal rows, productive store deterioration status over a fixed certified rule',
  );
}

const input = schema.components.schemas.ActionInput;
if (!input.description.includes(action)) {
  input.description += ` ${action} accepts only cutoff_month, requires a closed calendar month in America/Santiago, fixes grain=tienda + moving_average_12 + historical_percentile + deepening_2, and returns DETERIORATING / NOT_DETERIORATING / UNKNOWN by store.`;
}
fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

let motors = fs.readFileSync(motorsPath, 'utf8');
const anchor = '### `org_sales_observation_semantics_audit_v01`';
if (!motors.includes(`### \`${action}\``)) {
  const section = `### \`${action}\`\n\nMotor productivo de **Familia 3 — DETERIORO Y RED FLAGS**. Versión interna actual: \`0.1\`.\n\nPregunta:\n\n> ¿Qué tiendas están actualmente en deterioro, desde cuándo y qué evidencia lo sustenta?\n\nInput:\n\n\`\`\`text\ncutoff_month: YYYY-MM\n\`\`\`\n\nSólo acepta meses calendario cerrados en \`America/Santiago\`. No expone knobs de laboratorio. Regla certificada fija:\n\n\`\`\`text\ngrain = tienda\nbaseline = moving_average_12\ndeviation = historical_percentile\npersistence = deepening_2\n\`\`\`\n\nReutiliza \`buildOrgDeteriorationRuntime()\` y la semántica sparse de v0.4. Un episodio queda \`DETERIORATING\` desde su confirmación y permanece activo mientras las observaciones siguientes sigan adversas; una observación no adversa o un gap \`UNKNOWN\` rompe continuidad. No exige que cada mes posterior vuelva a profundizar.\n\nEstados:\n\n\`\`\`text\nDETERIORATING\nNOT_DETERIORATING\nUNKNOWN\n\`\`\`\n\n\`UNKNOWN\` preserva falta de observación actual, baseline insuficiente o desviación no evaluable; nunca se convierte en cero ni en estado saludable. Cada unidad devuelve observación actual, ventas, MA12, error, historical percentile y, cuando aplica, onset, confirmation y las filas que originalmente confirmaron el episodio.\n\n`;
  if (!motors.includes(anchor)) throw new Error('deterioration audit anchor not found');
  motors = motors.replace(anchor, `${section}${anchor}`);
}
fs.writeFileSync(motorsPath, motors);
